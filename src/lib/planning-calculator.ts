import { Decimal } from "@prisma/client/runtime/index-browser"
import type { PlanningLine, PlanningResult, PlanningScenario, PlanningSnapshot } from "./planning-types"

const D = Decimal.clone({ precision: 80 })
export function validPlanningQuantity(value: string) {
  return /^\d{1,12}(\.\d{1,6})?$/.test(value) && new D(value).gt(0)
}
export function validatePlanningLines(lines: PlanningLine[]) {
  if (!lines.length || lines.length > 1000) throw new Error("A BOM must contain between 1 and 1,000 lines.")
  const byKey = new Map(lines.map(line => [line.sourceLineKey, line]))
  if (byKey.size !== lines.length) throw new Error("BOM line keys must be unique.")
  for (const line of lines) {
    if (!validPlanningQuantity(line.quantity)) throw new Error(`Enter a positive quantity for ${line.sourceLineKey}.`)
    const seen = new Set([line.sourceLineKey])
    let parent = line.parentSourceLineKey
    while (parent) {
      if (seen.has(parent)) throw new Error("A component cannot be its own ancestor.")
      seen.add(parent)
      const found = byKey.get(parent)
      if (!found) throw new Error(`Parent ${parent} is missing.`)
      parent = found.parentSourceLineKey
    }
  }
}

/** Calculate a frozen scenario, sharing stock across all component occurrences.
 * A component DAG is processed parent-first globally (not project by project).
 * Ambiguous component dependency cycles are rejected rather than guessing stock use. */
export function calculatePlanning(snapshot: PlanningSnapshot, scenario: PlanningScenario): PlanningResult {
  if(scenario.selections.length>100)throw new Error("Select at most 100 BOM revisions per scenario.")
  const items = new Map(snapshot.items.map(item => [item.id, item]))
  const warnings = new Set<string>()
  type Node = { key: string; line: PlanningLine; children: Node[]; gross: Decimal; net: Decimal; path: string; project: string; bom: string; revision: string }
  const nodesByItem = new Map<string, Node[]>(), edges = new Map<string, Set<string>>(), indegree = new Map<string, number>()
  const seenVersions = new Set<string>()
  for (const selection of [...scenario.selections].sort((a,b)=>a.versionId.localeCompare(b.versionId))) {
    if (seenVersions.has(selection.versionId)) throw new Error("Select each BOM revision only once.")
    seenVersions.add(selection.versionId)
    if (!validPlanningQuantity(selection.quantity)) throw new Error("Enter a positive build quantity with at most six decimal places.")
    const version = snapshot.versions.find(version => version.id === selection.versionId)
    if (!version) throw new Error("A selected BOM revision is unavailable. Refresh source data.")
    const lines = scenario.edits[version.id] || version.lines
    validatePlanningLines(lines)
    const local = new Map<string, Node>()
    for (const line of lines) {
      const item = items.get(line.itemId)
      if (!item) throw new Error(`Component ${line.itemId} is unavailable.`)
      if (line.unit && line.unit !== item.unit) throw new Error(`${item.title}: BOM unit differs from the catalogue price/stock unit. Reconcile units first.`)
      if (line.scrapAllowance && !new D(line.scrapAllowance).isZero()) throw new Error(`${version.name}: scrap allowance needs a defined calculation rule before this BOM can be estimated.`)
      if (line.applicability.length) warnings.add(`${version.name}: all applicability variants are included using the recorded line quantity; no variant subset is selected.`)
      const node: Node = { key: `${version.id}:${line.sourceLineKey}`, line, children: [], gross: new D(0), net: new D(0), path: item.title, project: version.project.name, bom: version.name, revision: version.revision }
      local.set(line.sourceLineKey,node); const occurrences=nodesByItem.get(item.id)||[];occurrences.push(node);nodesByItem.set(item.id,occurrences);indegree.set(item.id, indegree.get(item.id)||0)
    }
    for (const node of local.values()) {
      const parent = node.line.parentSourceLineKey ? local.get(node.line.parentSourceLineKey)! : null
      if (parent) {
        parent.children.push(node)
        const targets = edges.get(parent.line.itemId) || new Set<string>()
        if (!targets.has(node.line.itemId)) indegree.set(node.line.itemId, (indegree.get(node.line.itemId)||0)+1)
        targets.add(node.line.itemId); edges.set(parent.line.itemId,targets)
      } else { node.gross = new D(selection.quantity).mul(node.line.quantity); node.net = node.gross }
    }
  }
  const order: string[] = [], queue = [...indegree].filter(([,degree])=>degree===0).map(([id])=>id).sort()
  while(queue.length) { const id=queue.shift()!; order.push(id); for(const child of edges.get(id)||[]) { indegree.set(child,indegree.get(child)!-1); if(indegree.get(child)===0){queue.push(child);queue.sort()} } }
  if(order.length!==indegree.size) throw new Error("The selected BOMs contain conflicting component dependency cycles. Resolve those relationships before stock planning.")
  const aggregates = new Map<string, { gross: Decimal; net: Decimal; used: Decimal; buy: Decimal; contributions: PlanningResult["materials"][number]["contributions"] }>()
  for(const itemId of order) {
    const item=items.get(itemId)!, occurrences=(nodesByItem.get(itemId)||[]).sort((a,b)=>a.key.localeCompare(b.key))
    let free=D.max(new D(item.onHand).minus(item.reserved),0)
    for(const node of occurrences) {
      if(node.gross.gt("1000000000000000000000000"))throw new Error("Derived requirement exceeds the supported planning range. Check BOM quantities and nesting.")
      const used=D.min(free,node.net); free=free.minus(used)
      const remaining=node.net.minus(used)
      if(node.children.length) {
        if(item.supplyMode==="BUY") throw new Error(`${item.title} is marked Buy but has manufacturing children. Resolve its treatment before planning.`)
        for(const child of node.children) { child.gross=node.gross.mul(child.line.quantity); child.net=remaining.mul(child.line.quantity); child.path=`${node.path} → ${child.path}` }
      } else {
        if(item.supplyMode==="MAKE" || item.supplyMode==="MAKE_OR_BUY") warnings.add(`${item.title}: no child manufacturing definition is present; cost uses the recorded component price.`)
        const row=aggregates.get(itemId)||{gross:new D(0),net:new D(0),used:new D(0),buy:new D(0),contributions:[]}
        row.gross=row.gross.plus(node.gross);row.net=row.net.plus(node.net);row.used=row.used.plus(used);row.buy=row.buy.plus(remaining)
        row.contributions.push({project:node.project,bom:node.bom,revision:node.revision,path:node.path,quantity:node.gross.toString()});aggregates.set(itemId,row)
      }
    }
  }
  const inScope=(categoryId:string|null)=>{
    if(scenario.categoryIds===null)return true
    if(!categoryId)return scenario.categoryIds.includes("UNCATEGORISED")
    return scenario.categoryIds.includes(categoryId)
  }
  const totals=new Map<string,{material:Decimal;purchase:Decimal}>()
  const materials=[...aggregates].filter(([id])=>inScope(items.get(id)!.categoryId)).map(([id,row])=>{
    const item=items.get(id)!,price=item.price,cost=price?row.gross.mul(price.amount):null,purchaseCost=price?row.buy.mul(price.amount):null
    if(price&&cost&&purchaseCost){const total=totals.get(price.currency)||{material:new D(0),purchase:new D(0)};total.material=total.material.plus(cost);total.purchase=total.purchase.plus(purchaseCost);totals.set(price.currency,total)}
    return {item,category:snapshot.categories.find(category=>category.id===item.categoryId)?.name||"Uncategorised",required:row.gross.toString(),afterAssembly:row.net.toString(),stockUsed:row.used.toString(),toBuy:row.buy.toString(),cost:cost?.toString()??null,purchaseCost:purchaseCost?.toString()??null,contributions:row.contributions}
  }).sort((a,b)=>a.category.localeCompare(b.category)||a.item.title.localeCompare(b.item.title))
  return {timestamp:snapshot.timestamp,materials,warnings:[...warnings],missingPrices:materials.filter(row=>!row.item.price).length,totals:[...totals].map(([currency,total])=>({currency,material:total.material.toString(),purchase:total.purchase.toString()}))}
}
