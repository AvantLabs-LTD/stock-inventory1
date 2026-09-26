import { randomUUID } from "node:crypto"
import { DefinitionStatus, Prisma, RecordStatus, RouteExecutionMode, RouteStepRequirementCapturePoint, RouteStepRequirementType, RouteTransitionType, SupplyMode, TrackingMode } from "@prisma/client"
import { z } from "zod"
import { db } from "@/lib/db"
import { IdempotencyError, completeIdempotentRequest, replayOrStartIdempotentRequest } from "@/lib/idempotency"
import { runSerializable } from "@/lib/transaction"

type Actor = { id: string; name: string }
type Tx = Prisma.TransactionClient

export class ManufacturingDefinitionError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message) }
}

export function manufacturingDefinitionApiError(error: unknown) {
  if (error instanceof ManufacturingDefinitionError) return Response.json({ code: error.code, error: error.message }, { status: error.status })
  if (error instanceof IdempotencyError) return Response.json({ code: error.code, error: error.message }, { status: error.status })
  if (error instanceof z.ZodError) return Response.json({ code: "INVALID_INPUT", error: error.issues.map(issue => issue.message).join("; ") }, { status: 400 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ code: "CONFLICT", error: "A record with this identifier already exists" }, { status: 409 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return Response.json({ code: "INVALID_REFERENCE", error: "A related record was not found" }, { status: 400 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return Response.json({ code: "CONCURRENT_UPDATE", error: "Concurrent definition update; retry" }, { status: 409 })
  console.error("Manufacturing definition operation failed", error)
  return Response.json({ code: "INTERNAL_ERROR", error: "Manufacturing definition operation failed" }, { status: 500 })
}

const id = z.string().trim().min(1).max(100)
const text = z.string().trim().min(1).max(250)
const optionalText = z.string().trim().max(4000).nullish().transform(value => value || null)
const optionalId = id.nullish().transform(value => value || null)
const decimal = z.union([z.string().trim(), z.number().finite().transform(String)]).refine(value => /^\d+(?:\.\d{1,6})?$/.test(value) && new Prisma.Decimal(value).gt(0), "Use a positive decimal with at most 6 decimal places").transform(value => new Prisma.Decimal(value))
const nonnegativeDecimal = z.union([z.string().trim(), z.number().finite().transform(String)]).refine(value => /^\d+(?:\.\d{1,6})?$/.test(value), "Use a nonnegative decimal with at most 6 decimal places").transform(value => new Prisma.Decimal(value))

const requirementSchema = z.object({
  requirementType: z.nativeEnum(RouteStepRequirementType),
  key: z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,63}$/, "Use an uppercase requirement key such as OPERATOR"),
  label: text,
  requiredAt: z.nativeEnum(RouteStepRequirementCapturePoint),
  required: z.boolean().default(false),
  allowMultiple: z.boolean().default(false),
  sequence: z.number().int().min(0).max(10000).optional(),
})

const bomLineApplicabilitySchema = z.object({
  tag: z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,63}$/, "Use an uppercase applicability tag such as PMU_MAIN"),
  quantity: decimal,
})

const bomLineSchema = z.object({
  sourceLineKey: z.string().trim().min(1).max(100),
  parentSourceLineKey: z.string().trim().min(1).max(100).nullish().transform(value => value || null),
  itemId: id,
  quantity: decimal,
  unit: z.string().trim().max(50).nullish().transform(value => value || null),
  scrapAllowance: nonnegativeDecimal.nullish().transform(value => value ?? null),
  consumptionRouteStepId: optionalId,
  notes: optionalText,
  sortOrder: z.number().int().min(0).max(100000).optional(),
  applicability: z.array(bomLineApplicabilitySchema).max(10).default([]),
}).superRefine((line, context) => {
  const tags = new Set<string>()
  line.applicability.forEach((entry, index) => {
    if (tags.has(entry.tag)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["applicability", index, "tag"], message: "Applicability tags must be unique per BOM line" })
    tags.add(entry.tag)
  })
})

function serializableBomLine(line: z.infer<typeof bomLineSchema>) {
  return {
    ...line,
    quantity: line.quantity.toString(),
    scrapAllowance: line.scrapAllowance?.toString() ?? null,
    applicability: line.applicability.map(entry => ({ tag: entry.tag, quantity: entry.quantity.toString() })),
  }
}

const routeStepSchema = z.object({
  operationId: id,
  nameOverride: optionalText,
  workCenterId: optionalId,
  executionMode: z.nativeEnum(RouteExecutionMode).default(RouteExecutionMode.INTERNAL),
  isSerializationPoint: z.boolean().default(false),
  active: z.boolean().default(true),
  requirements: z.array(requirementSchema).max(30).default([]),
})

export function validateBomHierarchy(lines: Array<{ sourceLineKey: string; parentSourceLineKey: string | null }>) {
  const byKey = new Map(lines.map(line => [line.sourceLineKey, line]))
  if (byKey.size !== lines.length) throw new ManufacturingDefinitionError("DUPLICATE_SOURCE_LINE_KEY", "Each BOM line needs a unique source line key")
  for (const line of lines) {
    if (line.parentSourceLineKey && !byKey.has(line.parentSourceLineKey)) {
      throw new ManufacturingDefinitionError("MISSING_BOM_PARENT", `BOM parent ${line.parentSourceLineKey} was not found`)
    }
  }
  for (const line of lines) {
    const visited = new Set<string>()
    let current: typeof line | undefined = line
    while (current?.parentSourceLineKey) {
      if (visited.has(current.sourceLineKey)) throw new ManufacturingDefinitionError("BOM_CYCLE", "BOM hierarchy contains a cycle")
      visited.add(current.sourceLineKey)
      current = byKey.get(current.parentSourceLineKey)
    }
  }
}

async function audit(tx: Tx, actor: Actor, action: string, entityType: string, entityId: string, details: unknown) {
  await tx.auditLog.create({ data: { userId: actor.id, userName: actor.name, action, entityType, entityId, details: JSON.stringify(details) } })
}

export async function listManufacturingDefinitions() {
  const [profiles, boms, routes, operations, workCenters, resources] = await Promise.all([
    db.manufacturingProfile.findMany({
      include: { item: { select: { id: true, code: true, title: true, unit: true } }, defaultBomVersion: { select: { id: true, revision: true, status: true } }, defaultRouteVersion: { select: { id: true, revision: true, status: true } } },
      orderBy: { item: { title: "asc" } },
    }),
    db.billOfMaterial.findMany({ include: { item: { select: { id: true, code: true, title: true, unit: true } }, projectTag: { select: { id: true, name: true } }, versions: { orderBy: { createdAt: "desc" }, include: { _count: { select: { lines: true } } } } }, orderBy: { updatedAt: "desc" } }),
    db.manufacturingRoute.findMany({ include: { item: { select: { id: true, code: true, title: true } }, versions: { orderBy: { createdAt: "desc" }, include: { _count: { select: { steps: true } } } } }, orderBy: { updatedAt: "desc" } }),
    db.manufacturingOperation.findMany({ include: { defaultWorkCenter: { select: { id: true, code: true, name: true } } }, orderBy: { name: "asc" } }),
    db.workCenter.findMany({ orderBy: { name: "asc" } }),
    db.productionResource.findMany({ include: { workCenter: { select: { id: true, code: true, name: true } } }, orderBy: { name: "asc" } }),
  ])
  return { profiles, boms, routes, operations, workCenters, resources }
}

export async function bomDetail(id: string) {
  const bom = await db.billOfMaterial.findUnique({
    where: { id },
    include: {
      item: { select: { id: true, code: true, title: true, unit: true } },
      projectTag: { select: { id: true, name: true } },
      versions: {
        orderBy: { createdAt: "desc" },
        include: {
          lines: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include: {
              item: { select: {
                id: true, code: true, title: true, unit: true, discipline: true, specification: true, description: true,
                manufacturerName: true, manufacturerPartNumber: true, supplierPartNumber: true, function: true, link: true,
                optionSelection: true, remarks: true, catalogueState: true, status: true, categoryId: true,
                category: { select: { id: true, name: true, discipline: true, parentId: true } },
                balance: { select: { onHand: true, reserved: true } },
                alternativeMemberships: { select: { group: { select: { id: true, name: true, memberships: { where: { item: { status: "ACTIVE" } }, select: { item: { select: { id: true, code: true, title: true } } } } } } } },
                purchaseLines: { take: 5, orderBy: { createdAt: "desc" }, select: { quantity: true, purchaseRequest: { select: { id: true, requestNo: true, status: true } } } },
              } },
              applicability: { orderBy: { tag: "asc" } },
              parentLine: { select: { id: true, sourceLineKey: true } },
              consumptionRouteStep: { select: { id: true, sequence: true, operation: { select: { code: true, name: true } } } },
            },
          },
        },
      },
    },
  })
  if (!bom) throw new ManufacturingDefinitionError("BOM_NOT_FOUND", "BOM was not found", 404)
  return bom
}

export async function routeDetail(id: string) {
  const route = await db.manufacturingRoute.findUnique({
    where: { id },
    include: {
      item: { select: { id: true, code: true, title: true } },
      versions: {
        orderBy: { createdAt: "desc" },
        include: {
          steps: { orderBy: { sequence: "asc" }, include: { operation: true, workCenter: true, requirements: { orderBy: { sequence: "asc" } } } },
          transitions: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  })
  if (!route) throw new ManufacturingDefinitionError("ROUTE_NOT_FOUND", "Route was not found", 404)
  return route
}

/**
 * A read-only per-build material roll-up for active project BOMs. Quantities
 * are derived through the accepted hierarchy; this is intentionally not a
 * stock allocation or a production-plan quantity.
 */
export async function manufacturingPlanningRollup() {
  const versions = await db.bomVersion.findMany({
    where: { status: DefinitionStatus.ACTIVE, bom: { status: RecordStatus.ACTIVE, projectTagId: { not: null } } },
    include: {
      bom: { include: { projectTag: { select: { id: true, name: true } } } },
      lines: {
        include: {
          item: {
            include: {
              category: { select: { id: true, name: true, parent: { select: { id: true, name: true } } } },
            },
          },
        },
      },
    },
    orderBy: [{ bom: { projectTag: { name: "asc" } } }, { bom: { name: "asc" } }],
  })
  const rows = new Map<string, {
    project: { id: string; name: string }
    category: { id: string | null; name: string }
    item: { id: string; code: string; title: string; unit: string }
    quantityPerBuild: Prisma.Decimal
    bomCount: number
    bomNames: Set<string>
  }>()
  for (const version of versions) {
    const project = version.bom.projectTag
    if (!project) continue
    const children = new Map<string, typeof version.lines>()
    for (const line of version.lines) {
      if (line.parentLineId) children.set(line.parentLineId, [...(children.get(line.parentLineId) || []), line])
    }
    const visit = (line: typeof version.lines[number], multiplier: Prisma.Decimal) => {
      const requirement = multiplier.mul(line.quantity)
      const category = line.item.category?.parent?.name
        ? `${line.item.category.parent.name} / ${line.item.category.name}`
        : line.item.category?.name || "Uncategorised"
      const key = [version.bom.projectTagId, line.item.categoryId || "none", line.itemId].join(":")
      const existing = rows.get(key)
      if (existing) {
        existing.quantityPerBuild = existing.quantityPerBuild.plus(requirement)
        existing.bomNames.add(version.bom.name)
      } else {
        rows.set(key, {
          project,
          category: { id: line.item.categoryId, name: category },
          item: { id: line.item.id, code: line.item.code, title: line.item.title, unit: line.item.unit },
          quantityPerBuild: requirement,
          bomCount: 1,
          bomNames: new Set([version.bom.name]),
        })
      }
      for (const child of children.get(line.id) || []) visit(child, requirement)
    }
    for (const root of version.lines.filter(line => !line.parentLineId)) visit(root, new Prisma.Decimal(1))
  }
  return {
    generatedAt: new Date().toISOString(),
    basis: "Quantities required to build one output of each active BOM; stock, allocations, purchase coverage, and future production-plan quantities are excluded.",
    rows: [...rows.values()]
      .map(row => ({ ...row, quantityPerBuild: row.quantityPerBuild.toString(), bomCount: row.bomNames.size, bomNames: [...row.bomNames].sort() }))
      .sort((left, right) => left.project.name.localeCompare(right.project.name) || left.category.name.localeCompare(right.category.name) || left.item.title.localeCompare(right.item.title)),
  }
}

/** A read-only scenario analysis. It stores no plan facts: callers supply the
 * project quantities and the response is always derived from active BOMs and
 * immutable price evidence. Other planning insights can reuse this input. */
export async function manufacturingPlanningAnalysis(raw: unknown) {
  const input = z.object({ projects: z.array(z.object({ projectTagId: id, quantity: z.coerce.number().positive().max(1_000_000) })).min(1).max(100) }).parse(raw)
  const selected = new Map(input.projects.map(row => [row.projectTagId, new Prisma.Decimal(row.quantity)]))
  if (selected.size !== input.projects.length) throw new ManufacturingDefinitionError("DUPLICATE_PROJECT", "Select each project only once")
  const versions = await db.bomVersion.findMany({
    where: { status: DefinitionStatus.ACTIVE, bom: { status: RecordStatus.ACTIVE, projectTagId: { in: [...selected.keys()] } } },
    include: { bom: { include: { projectTag: { select: { id: true, name: true } } } }, lines: { include: { item: { include: { category: { select: { id: true, name: true } }, priceHistory: { orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }], take: 1 } } } } } },
  })
  const rows = new Map<string, { item: typeof versions[number]["lines"][number]["item"]; quantity: Prisma.Decimal; projects: Map<string, Prisma.Decimal>; bomNames: Set<string> }>()
  for (const version of versions) {
    const project = version.bom.projectTag
    if (!project) continue
    const buildQuantity = selected.get(project.id)
    if (!buildQuantity) continue
    const children = new Map<string, typeof version.lines>()
    for (const line of version.lines) if (line.parentLineId) children.set(line.parentLineId, [...(children.get(line.parentLineId) || []), line])
    const visit = (line: typeof version.lines[number], multiplier: Prisma.Decimal) => {
      const required = multiplier.mul(line.quantity)
      const descendants = children.get(line.id) || []
      if (descendants.length) { descendants.forEach(child => visit(child, required)); return }
      const existing = rows.get(line.itemId) || { item: line.item, quantity: new Prisma.Decimal(0), projects: new Map(), bomNames: new Set() }
      existing.quantity = existing.quantity.plus(required)
      existing.projects.set(project.name, existing.projects.get(project.name)?.plus(required) || required)
      existing.bomNames.add(version.bom.name)
      rows.set(line.itemId, existing)
    }
    version.lines.filter(line => !line.parentLineId).forEach(line => visit(line, buildQuantity))
  }
  const totals = new Map<string, Prisma.Decimal>(), missingPrices: string[] = []
  const materials = [...rows.values()].map(row => {
    const price = row.item.priceHistory[0] || null
    const extendedCost = price ? row.quantity.mul(price.amount) : null
    if (extendedCost && price) totals.set(price.currency, totals.get(price.currency)?.plus(extendedCost) || extendedCost)
    if (!price) missingPrices.push(row.item.title)
    return { item: { id: row.item.id, code: row.item.code, title: row.item.title, unit: row.item.unit, category: row.item.category }, quantity: row.quantity.toString(), projectQuantities: [...row.projects.entries()].map(([project, quantity]) => ({ project, quantity: quantity.toString() })), bomNames: [...row.bomNames].sort(), latestPrice: price ? { amount: price.amount.toString(), currency: price.currency, effectiveAt: price.effectiveAt.toISOString(), source: price.source } : null, extendedCost: extendedCost?.toString() || null }
  }).sort((a, b) => (a.item.category?.name || "").localeCompare(b.item.category?.name || "") || a.item.title.localeCompare(b.item.title))
  return { basis: "Leaf components of active project BOMs. Quantities are recursively derived for the selected project build quantities; costs use each component’s latest immutable price record and are never converted across currencies.", selections: input.projects, materials, totals: [...totals.entries()].map(([currency, amount]) => ({ currency, amount: amount.toString() })), missingPrices }
}

export async function createManufacturingProfile(raw: unknown, actor: Actor) {
  const input = z.object({ itemId: id, supplyMode: z.nativeEnum(SupplyMode), trackingMode: z.nativeEnum(TrackingMode).default(TrackingMode.QUANTITY), defaultBomVersionId: optionalId, defaultRouteVersionId: optionalId, traceInFinishedProduct: z.boolean().default(false) }).parse(raw)
  return runSerializable(async tx => {
    const item = await tx.item.findUnique({ where: { id: input.itemId }, select: { id: true } })
    if (!item) throw new ManufacturingDefinitionError("ITEM_NOT_FOUND", "Manufacturing profile item was not found", 404)
    if (input.defaultBomVersionId) {
      const version = await tx.bomVersion.findUnique({ where: { id: input.defaultBomVersionId }, include: { bom: true } })
      if (!version || version.status !== DefinitionStatus.ACTIVE || version.bom.itemId !== input.itemId) throw new ManufacturingDefinitionError("INVALID_DEFAULT_BOM", "Choose an active BOM version for the same item")
    }
    if (input.defaultRouteVersionId) {
      const version = await tx.routeVersion.findUnique({ where: { id: input.defaultRouteVersionId }, include: { route: true } })
      if (!version || version.status !== DefinitionStatus.ACTIVE || (version.route.itemId && version.route.itemId !== input.itemId)) throw new ManufacturingDefinitionError("INVALID_DEFAULT_ROUTE", "Choose an active route applicable to this item")
    }
    const profile = await tx.manufacturingProfile.upsert({ where: { itemId: input.itemId }, update: input, create: input })
    await audit(tx, actor, "MANUFACTURING_PROFILE_SAVE", "ManufacturingProfile", profile.id, input)
    return profile
  })
}

/** Publish reviewed sandbox deltas as new drafts, never mutate accepted lines. */
export async function commitPlanningChanges(raw: unknown, actor: Actor, key: string) {
  const input=z.object({note:z.string().trim().min(1).max(2000),revisions:z.array(z.object({versionId:id,lines:z.array(bomLineSchema).min(1).max(1000)})).min(1).max(30)}).parse(raw)
  if(new Set(input.revisions.map(row=>row.versionId)).size!==input.revisions.length)throw new ManufacturingDefinitionError("DUPLICATE_BOM","Select each BOM once")
  for(const revision of input.revisions)validateBomHierarchy(revision.lines)
  return runSerializable(async tx=>{
    const payload={note:input.note,revisions:input.revisions.map(row=>({...row,lines:row.lines.map(serializableBomLine)}))}
    const replay=await replayOrStartIdempotentRequest(tx,{actorId:actor.id,key,action:"planning.commit",payload})
    if(replay)return replay
    const created:Array<{id:string;bomId:string;revision:string}>=[]
    for(const change of input.revisions){
      const base=await tx.bomVersion.findUnique({where:{id:change.versionId},include:{bom:true}})
      if(!base||base.status!=="ACTIVE")throw new ManufacturingDefinitionError("BOM_CHANGED","The source BOM is no longer active. Refresh and review the new revision before committing.",409)
      const itemIds=[...new Set(change.lines.map(line=>line.itemId))]
      const items=await tx.item.findMany({where:{id:{in:itemIds}},select:{id:true,unit:true}})
      if(items.length!==itemIds.length)throw new ManufacturingDefinitionError("ITEM_NOT_FOUND","A component is no longer available")
      if(change.lines.some(line=>line.unit&&line.unit!==items.find(item=>item.id===line.itemId)?.unit))throw new ManufacturingDefinitionError("UNIT_MISMATCH","Reconcile component units before committing")
      const version=await tx.bomVersion.create({data:{bomId:base.bomId,revision:`scenario-${randomUUID()}`,createdById:actor.id}})
      const ids=new Map(change.lines.map(line=>[line.sourceLineKey,randomUUID()]))
      const depth=(line:typeof change.lines[number])=>{let count=0,parent=line.parentSourceLineKey;while(parent){count++;parent=change.lines.find(row=>row.sourceLineKey===parent)!.parentSourceLineKey}return count}
      for(const line of [...change.lines].sort((a,b)=>depth(a)-depth(b)))await tx.bomLine.create({data:{id:ids.get(line.sourceLineKey),bomVersionId:version.id,itemId:line.itemId,parentLineId:line.parentSourceLineKey?ids.get(line.parentSourceLineKey):null,sourceLineKey:line.sourceLineKey,quantity:line.quantity,unit:line.unit,notes:line.notes,sortOrder:line.sortOrder??0,scrapAllowance:line.scrapAllowance,consumptionRouteStepId:line.consumptionRouteStepId,applicability:{create:line.applicability}}})
      await audit(tx,actor,"PLANNING_BOM_DRAFT_CREATE","BomVersion",version.id,{baseVersionId:base.id,note:input.note,lines:change.lines.map(serializableBomLine)})
      created.push({id:version.id,bomId:version.bomId,revision:version.revision})
    }
    const result={revisions:created};await completeIdempotentRequest(tx,{actorId:actor.id,key,response:result});return result
  },{timeout:30000})
}

export async function createBillOfMaterial(raw: unknown, actor: Actor, idempotencyKey: string | null = null) {
  const input = z.object({ bomId: optionalId, itemId: id, projectTagId: optionalId, name: text, revision: text, effectiveFrom: z.coerce.date().nullish().transform(value => value ?? null), effectiveTo: z.coerce.date().nullish().transform(value => value ?? null), lines: z.array(bomLineSchema).min(1).max(1000) }).parse(raw)
  validateBomHierarchy(input.lines)
  if (input.effectiveFrom && input.effectiveTo && input.effectiveTo < input.effectiveFrom) throw new ManufacturingDefinitionError("INVALID_EFFECTIVITY", "Effective end cannot precede effective start")
  return runSerializable(async tx => {
    const replay = await replayOrStartIdempotentRequest(tx, {
      actorId: actor.id,
      key: idempotencyKey,
      action: "manufacturing.bom.create",
      payload: {
        ...input,
        effectiveFrom: input.effectiveFrom?.toISOString() ?? null,
        effectiveTo: input.effectiveTo?.toISOString() ?? null,
        lines: input.lines.map(serializableBomLine),
      },
    })
    if (replay) return replay as unknown as Awaited<ReturnType<typeof bomDetail>>
    const itemIds = [...new Set([input.itemId, ...input.lines.map(line => line.itemId)])]
    const found = await tx.item.findMany({ where: { id: { in: itemIds } }, select: { id: true } })
    if (found.length !== itemIds.length) throw new ManufacturingDefinitionError("ITEM_NOT_FOUND", "One or more BOM components were not found", 404)
    if (input.projectTagId && !await tx.projectTag.findUnique({ where: { id: input.projectTagId }, select: { id: true } })) throw new ManufacturingDefinitionError("PROJECT_NOT_FOUND", "Project was not found", 404)
    const stepIds = input.lines.flatMap(line => line.consumptionRouteStepId ? [line.consumptionRouteStepId] : [])
    if (stepIds.length && (await tx.routeStep.count({ where: { id: { in: stepIds } } })) !== new Set(stepIds).size) throw new ManufacturingDefinitionError("ROUTE_STEP_NOT_FOUND", "A BOM consumption step was not found", 404)
    const existingBom = input.bomId
      ? await tx.billOfMaterial.findUnique({ where: { id: input.bomId }, select: { id: true, itemId: true, projectTagId: true, name: true } })
      : null
    if (input.bomId && !existingBom) throw new ManufacturingDefinitionError("BOM_NOT_FOUND", "BOM was not found", 404)
    if (existingBom && (existingBom.itemId !== input.itemId || existingBom.projectTagId !== input.projectTagId || existingBom.name !== input.name)) {
      throw new ManufacturingDefinitionError("IMMUTABLE_BOM_IDENTITY", "A new revision cannot change its BOM item, project scope, or name")
    }
    const bom = existingBom ?? await tx.billOfMaterial.create({ data: { itemId: input.itemId, projectTagId: input.projectTagId, name: input.name, createdById: actor.id } })
    const version = await tx.bomVersion.create({ data: { bomId: bom.id, revision: input.revision, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, createdById: actor.id } })
    const idsByKey = new Map(input.lines.map(line => [line.sourceLineKey, randomUUID()]))
    for (const [index, line] of input.lines.entries()) {
      await tx.bomLine.create({ data: { id: idsByKey.get(line.sourceLineKey), bomVersionId: version.id, itemId: line.itemId, parentLineId: line.parentSourceLineKey ? idsByKey.get(line.parentSourceLineKey) : null, sourceLineKey: line.sourceLineKey, quantity: line.quantity, unit: line.unit, scrapAllowance: line.scrapAllowance, consumptionRouteStepId: line.consumptionRouteStepId, notes: line.notes, sortOrder: line.sortOrder ?? index, applicability: { create: line.applicability } } })
    }
    await audit(tx, actor, input.bomId ? "MANUFACTURING_BOM_VERSION_CREATE" : "MANUFACTURING_BOM_CREATE", "BillOfMaterial", bom.id, { ...input, lines: input.lines.map(serializableBomLine) })
    const result = await tx.billOfMaterial.findUniqueOrThrow({ where: { id: bom.id }, include: { versions: { include: { lines: true } } } })
    await completeIdempotentRequest(tx, { actorId: actor.id, key: idempotencyKey, response: result })
    return result
  })
}

/** Draft definitions are editable because they are not released history. Once
 * active, the only supported change is a new revision. */
export async function replaceDraftBomVersion(versionId: string, raw: unknown, actor: Actor, idempotencyKey: string | null = null) {
  const input = z.object({ lines: z.array(bomLineSchema).min(1).max(1000) }).parse(raw)
  validateBomHierarchy(input.lines)
  return runSerializable(async tx => {
    const replay = await replayOrStartIdempotentRequest(tx, {
      actorId: actor.id,
      key: idempotencyKey,
      action: "manufacturing.bom-version.replace-draft",
      payload: { versionId, lines: input.lines.map(serializableBomLine) },
    })
    if (replay) return replay as unknown
    const version = await tx.bomVersion.findUnique({ where: { id: versionId }, include: { lines: { select: { id: true } } } })
    if (!version) throw new ManufacturingDefinitionError("BOM_VERSION_NOT_FOUND", "BOM version was not found", 404)
    if (version.status !== DefinitionStatus.DRAFT) throw new ManufacturingDefinitionError("BOM_VERSION_IMMUTABLE", "Only Draft BOM revisions may be corrected")
    const itemIds = [...new Set(input.lines.map(line => line.itemId))]
    if ((await tx.item.count({ where: { id: { in: itemIds } } })) !== itemIds.length) throw new ManufacturingDefinitionError("ITEM_NOT_FOUND", "One or more BOM components were not found", 404)
    const stepIds = [...new Set(input.lines.flatMap(line => line.consumptionRouteStepId ? [line.consumptionRouteStepId] : []))]
    if (stepIds.length && (await tx.routeStep.count({ where: { id: { in: stepIds } } })) !== stepIds.length) throw new ManufacturingDefinitionError("ROUTE_STEP_NOT_FOUND", "A BOM consumption step was not found", 404)
    // Parent links are removed first so this remains valid for hierarchical Drafts.
    await tx.bomLine.updateMany({ where: { bomVersionId: versionId, parentLineId: { not: null } }, data: { parentLineId: null } })
    await tx.bomLine.deleteMany({ where: { bomVersionId: versionId } })
    const idsByKey = new Map(input.lines.map(line => [line.sourceLineKey, randomUUID()]))
    for (const [index, line] of input.lines.entries()) {
      await tx.bomLine.create({ data: { id: idsByKey.get(line.sourceLineKey), bomVersionId: versionId, itemId: line.itemId, parentLineId: line.parentSourceLineKey ? idsByKey.get(line.parentSourceLineKey) : null, sourceLineKey: line.sourceLineKey, quantity: line.quantity, unit: line.unit, scrapAllowance: line.scrapAllowance, consumptionRouteStepId: line.consumptionRouteStepId, notes: line.notes, sortOrder: line.sortOrder ?? index, applicability: { create: line.applicability } } })
    }
    const result = await tx.bomVersion.findUniqueOrThrow({ where: { id: versionId }, include: { lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { item: { select: { id: true, code: true, title: true, unit: true } }, applicability: { orderBy: { tag: "asc" } } } } } })
    await audit(tx, actor, "MANUFACTURING_BOM_VERSION_DRAFT_REPLACE", "BomVersion", versionId, { bomId: version.bomId, replacedLineCount: version.lines.length, lines: input.lines.map(serializableBomLine) })
    await completeIdempotentRequest(tx, { actorId: actor.id, key: idempotencyKey, response: result })
    return result
  })
}

/** Corrects a project scope only while the definition is still entirely Draft
 * and has never been used by an order. Released history is never re-scoped. */
export async function reassignDraftBomProject(bomId: string, raw: unknown, actor: Actor, idempotencyKey: string | null = null) {
  const input = z.object({ projectTagId: optionalId }).parse(raw)
  return runSerializable(async tx => {
    const replay = await replayOrStartIdempotentRequest(tx, {
      actorId: actor.id,
      key: idempotencyKey,
      action: "manufacturing.bom.reassign-project",
      payload: { bomId, projectTagId: input.projectTagId },
    })
    if (replay) return replay as unknown as Awaited<ReturnType<typeof bomDetail>>
    const bom = await tx.billOfMaterial.findUnique({
      where: { id: bomId },
      include: { versions: { select: { id: true, status: true, _count: { select: { productionOrders: true } } } } },
    })
    if (!bom) throw new ManufacturingDefinitionError("BOM_NOT_FOUND", "BOM was not found", 404)
    if (bom.versions.some(version => version.status !== DefinitionStatus.DRAFT || version._count.productionOrders > 0)) {
      throw new ManufacturingDefinitionError("BOM_PROJECT_IMMUTABLE", "Only wholly Draft BOMs with no production orders may be re-scoped")
    }
    if (input.projectTagId && !await tx.projectTag.findUnique({ where: { id: input.projectTagId }, select: { id: true } })) {
      throw new ManufacturingDefinitionError("PROJECT_NOT_FOUND", "Project was not found", 404)
    }
    const updated = await tx.billOfMaterial.update({ where: { id: bomId }, data: { projectTagId: input.projectTagId } })
    await audit(tx, actor, "MANUFACTURING_BOM_PROJECT_REASSIGN", "BillOfMaterial", bomId, { previousProjectTagId: bom.projectTagId, projectTagId: input.projectTagId })
    const result = await tx.billOfMaterial.findUniqueOrThrow({
      where: { id: updated.id },
      include: {
        item: { select: { id: true, code: true, title: true, unit: true } },
        projectTag: { select: { id: true, name: true } },
        versions: {
          orderBy: { createdAt: "desc" },
          include: {
            lines: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              include: {
                item: { select: { id: true, code: true, title: true, unit: true } },
                applicability: { orderBy: { tag: "asc" } },
                parentLine: { select: { id: true, sourceLineKey: true } },
              },
            },
          },
        },
      },
    })
    await completeIdempotentRequest(tx, { actorId: actor.id, key: idempotencyKey, response: result })
    return result
  })
}

export async function createManufacturingRoute(raw: unknown, actor: Actor) {
  const input = z.object({ routeId: optionalId, itemId: optionalId, name: text, description: optionalText, revision: text, effectiveFrom: z.coerce.date().nullish().transform(value => value ?? null), effectiveTo: z.coerce.date().nullish().transform(value => value ?? null), steps: z.array(routeStepSchema).min(1).max(100).superRefine((steps, context) => {
    if (steps.filter(step => step.isSerializationPoint).length > 1) context.addIssue({ code: z.ZodIssueCode.custom, message: "A route version may have only one serialization point" })
    steps.forEach((step, index) => {
      const keys = new Set<string>()
      step.requirements.forEach(requirement => {
        if (keys.has(requirement.key)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "requirements"], message: "Requirement keys must be unique within a route step" })
        keys.add(requirement.key)
      })
    })
  }), reworkTransitions: z.array(z.object({ fromSequence: z.number().int().min(1), toSequence: z.number().int().min(1), transitionType: z.enum([RouteTransitionType.REWORK, RouteTransitionType.ALTERNATIVE]).default(RouteTransitionType.REWORK) })).max(100).default([]) }).parse(raw)
  if (input.effectiveFrom && input.effectiveTo && input.effectiveTo < input.effectiveFrom) throw new ManufacturingDefinitionError("INVALID_EFFECTIVITY", "Effective end cannot precede effective start")
  return runSerializable(async tx => {
    if (input.itemId && !await tx.item.findUnique({ where: { id: input.itemId }, select: { id: true } })) throw new ManufacturingDefinitionError("ITEM_NOT_FOUND", "Route item was not found", 404)
    const operationIds = [...new Set(input.steps.map(step => step.operationId))]
    if ((await tx.manufacturingOperation.count({ where: { id: { in: operationIds }, status: RecordStatus.ACTIVE } })) !== operationIds.length) throw new ManufacturingDefinitionError("OPERATION_NOT_FOUND", "Every route step needs an active manufacturing operation", 404)
    const workCenterIds = [...new Set(input.steps.flatMap(step => step.workCenterId ? [step.workCenterId] : []))]
    if (workCenterIds.length && (await tx.workCenter.count({ where: { id: { in: workCenterIds }, status: RecordStatus.ACTIVE } })) !== workCenterIds.length) throw new ManufacturingDefinitionError("WORK_CENTER_NOT_FOUND", "A selected work center was not found or is inactive", 404)
    const existingRoute = input.routeId
      ? await tx.manufacturingRoute.findUnique({ where: { id: input.routeId }, select: { id: true, itemId: true, name: true, description: true } })
      : null
    if (input.routeId && !existingRoute) throw new ManufacturingDefinitionError("ROUTE_NOT_FOUND", "Route was not found", 404)
    if (existingRoute && (existingRoute.itemId !== input.itemId || existingRoute.name !== input.name || existingRoute.description !== input.description)) {
      throw new ManufacturingDefinitionError("IMMUTABLE_ROUTE_IDENTITY", "A new revision cannot change its route item, name, or description")
    }
    const route = existingRoute ?? await tx.manufacturingRoute.create({ data: { itemId: input.itemId, name: input.name, description: input.description, createdById: actor.id } })
    const version = await tx.routeVersion.create({ data: { routeId: route.id, revision: input.revision, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, createdById: actor.id } })
    const stepIds: string[] = []
    for (const [index, step] of input.steps.entries()) {
      const stepId = randomUUID(); stepIds.push(stepId)
      await tx.routeStep.create({ data: { id: stepId, routeVersionId: version.id, operationId: step.operationId, sequence: index + 1, nameOverride: step.nameOverride, workCenterId: step.workCenterId, executionMode: step.executionMode, isSerializationPoint: step.isSerializationPoint, active: step.active, requirements: { create: step.requirements.map((requirement, requirementIndex) => ({ ...requirement, sequence: requirement.sequence ?? requirementIndex })) } } })
    }
    for (let index = 0; index + 1 < stepIds.length; index += 1) await tx.routeTransition.create({ data: { routeVersionId: version.id, fromStepId: stepIds[index], toStepId: stepIds[index + 1], transitionType: RouteTransitionType.NORMAL } })
    for (const transition of input.reworkTransitions) {
      const fromStepId = stepIds[transition.fromSequence - 1], toStepId = stepIds[transition.toSequence - 1]
      if (!fromStepId || !toStepId || fromStepId === toStepId) throw new ManufacturingDefinitionError("INVALID_ROUTE_TRANSITION", "Rework transition references an invalid route step")
      await tx.routeTransition.create({ data: { routeVersionId: version.id, fromStepId, toStepId, transitionType: transition.transitionType } })
    }
    await audit(tx, actor, input.routeId ? "MANUFACTURING_ROUTE_VERSION_CREATE" : "MANUFACTURING_ROUTE_CREATE", "ManufacturingRoute", route.id, { ...input, steps: input.steps.map(step => ({ ...step, requirements: step.requirements })) })
    return tx.manufacturingRoute.findUniqueOrThrow({ where: { id: route.id }, include: { versions: { include: { steps: { include: { requirements: true } }, transitions: true } } } })
  })
}

export async function activateBomVersion(versionId: string, actor: Actor) {
  return runSerializable(async tx => {
    const version = await tx.bomVersion.findUnique({ where: { id: versionId }, include: { lines: true } })
    if (!version) throw new ManufacturingDefinitionError("BOM_VERSION_NOT_FOUND", "BOM version was not found", 404)
    if (version.status === DefinitionStatus.RETIRED) throw new ManufacturingDefinitionError("BOM_VERSION_RETIRED", "Retired BOM versions cannot be activated")
    if (!version.lines.length) throw new ManufacturingDefinitionError("BOM_LINES_REQUIRED", "A BOM version needs at least one line")
    await tx.bomVersion.updateMany({ where: { bomId: version.bomId, status: DefinitionStatus.ACTIVE, id: { not: version.id } }, data: { status: DefinitionStatus.RETIRED } })
    const active = await tx.bomVersion.update({ where: { id: version.id }, data: { status: DefinitionStatus.ACTIVE, approvedAt: new Date(), approvedById: actor.id } })
    await audit(tx, actor, "MANUFACTURING_BOM_VERSION_ACTIVATE", "BomVersion", version.id, { bomId: version.bomId, revision: version.revision })
    return active
  })
}

export async function activateRouteVersion(versionId: string, actor: Actor) {
  return runSerializable(async tx => {
    const version = await tx.routeVersion.findUnique({ where: { id: versionId }, include: { steps: { include: { requirements: true } }, transitions: true } })
    if (!version) throw new ManufacturingDefinitionError("ROUTE_VERSION_NOT_FOUND", "Route version was not found", 404)
    if (version.status === DefinitionStatus.RETIRED) throw new ManufacturingDefinitionError("ROUTE_VERSION_RETIRED", "Retired route versions cannot be activated")
    if (!version.steps.length) throw new ManufacturingDefinitionError("ROUTE_STEPS_REQUIRED", "A route version needs at least one step")
    const normal = version.transitions.filter(transition => transition.transitionType === RouteTransitionType.NORMAL)
    if (normal.length !== Math.max(version.steps.length - 1, 0)) throw new ManufacturingDefinitionError("ROUTE_NORMAL_TRANSITIONS_REQUIRED", "A linear route needs one normal transition between each consecutive step")
    await tx.routeVersion.updateMany({ where: { routeId: version.routeId, status: DefinitionStatus.ACTIVE, id: { not: version.id } }, data: { status: DefinitionStatus.RETIRED } })
    const active = await tx.routeVersion.update({ where: { id: version.id }, data: { status: DefinitionStatus.ACTIVE, approvedAt: new Date(), approvedById: actor.id } })
    await audit(tx, actor, "MANUFACTURING_ROUTE_VERSION_ACTIVATE", "RouteVersion", version.id, { routeId: version.routeId, revision: version.revision })
    return active
  })
}

export async function saveReferenceDefinition(kind: "operation" | "work-center" | "resource", raw: unknown, actor: Actor) {
  if (kind === "operation") {
    const input = z.object({ id: optionalId, code: text, name: text, description: optionalText, defaultWorkCenterId: optionalId, status: z.nativeEnum(RecordStatus).default(RecordStatus.ACTIVE) }).parse(raw)
    return runSerializable(async tx => {
      if (input.defaultWorkCenterId && !await tx.workCenter.findUnique({ where: { id: input.defaultWorkCenterId }, select: { id: true } })) throw new ManufacturingDefinitionError("WORK_CENTER_NOT_FOUND", "Default work center was not found", 404)
      const { id: operationId, ...data } = input
      const record = operationId ? await tx.manufacturingOperation.update({ where: { id: operationId }, data }) : await tx.manufacturingOperation.create({ data })
      await audit(tx, actor, operationId ? "MANUFACTURING_OPERATION_UPDATE" : "MANUFACTURING_OPERATION_CREATE", "ManufacturingOperation", record.id, data)
      return record
    })
  }
  if (kind === "work-center") {
    const input = z.object({ id: optionalId, code: text, name: text, description: optionalText, status: z.nativeEnum(RecordStatus).default(RecordStatus.ACTIVE) }).parse(raw)
    return runSerializable(async tx => {
      const { id: workCenterId, ...data } = input
      const record = workCenterId ? await tx.workCenter.update({ where: { id: workCenterId }, data }) : await tx.workCenter.create({ data })
      await audit(tx, actor, workCenterId ? "WORK_CENTER_UPDATE" : "WORK_CENTER_CREATE", "WorkCenter", record.id, data)
      return record
    })
  }
  const input = z.object({ id: optionalId, code: text, name: text, resourceType: z.enum(["CNC_MACHINE", "LATHE", "MILL", "THREE_D_PRINTER", "REFLOW_OVEN", "TEST_BENCH", "ASSEMBLY_STATION", "OTHER"]), workCenterId: optionalId, status: z.enum(["AVAILABLE", "UNAVAILABLE", "RETIRED"]).default("AVAILABLE"), metadata: z.record(z.string(), z.unknown()).nullish().transform(value => value ?? null) }).parse(raw)
  return runSerializable(async tx => {
    if (input.workCenterId && !await tx.workCenter.findUnique({ where: { id: input.workCenterId }, select: { id: true } })) throw new ManufacturingDefinitionError("WORK_CENTER_NOT_FOUND", "Resource work center was not found", 404)
    const { id: resourceId, metadata, ...rest } = input
    const data = { ...rest, metadata: metadata ? metadata as Prisma.InputJsonValue : Prisma.JsonNull }
    const record = resourceId ? await tx.productionResource.update({ where: { id: resourceId }, data }) : await tx.productionResource.create({ data })
    await audit(tx, actor, resourceId ? "PRODUCTION_RESOURCE_UPDATE" : "PRODUCTION_RESOURCE_CREATE", "ProductionResource", record.id, data)
    return record
  })
}
