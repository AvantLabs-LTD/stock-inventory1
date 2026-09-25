import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { getSession, hasPermission, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-middleware"
import { manufacturingDefinitionApiError } from "@/lib/manufacturing-definitions-service"

export async function GET(request: NextRequest) {
  const session=await getSession(request)
  if(!session)return unauthorizedResponse()
  if(!hasPermission(session,"manufacturing.view") || !hasPermission(session,"vault.catalogue.view"))return forbiddenResponse()
  try {
    const result=await db.$transaction(async tx=>{
      const timestamp=new Date()
      const [versions,items,categories]=await Promise.all([
        tx.bomVersion.findMany({where:{status:{in:["ACTIVE","RETIRED"]},bom:{status:"ACTIVE",projectTagId:{not:null}}},include:{bom:{include:{projectTag:true,item:{select:{title:true}}}},lines:{include:{parentLine:{select:{sourceLineKey:true}},applicability:true},orderBy:[{sortOrder:"asc"},{id:"asc"}]}},orderBy:{id:"asc"},take:500}),
        tx.item.findMany({select:{id:true,code:true,title:true,unit:true,categoryId:true,specification:true,manufacturerPartNumber:true,balance:{select:{onHand:true,reserved:true}},manufacturingProfile:{select:{supplyMode:true}},priceHistory:{select:{id:true,amount:true,currency:true,effectiveAt:true,source:true},where:{effectiveAt:{lte:timestamp}},orderBy:[{effectiveAt:"desc"},{createdAt:"desc"},{id:"desc"}],take:1}},orderBy:{id:"asc"},take:10001}),
        tx.itemCategory.findMany({select:{id:true,name:true,parentId:true,discipline:true},orderBy:{name:"asc"}}),
      ])
      if(items.length>10000 || versions.length===500)throw new Error("Planning catalogue exceeds snapshot limits; narrow the server snapshot before continuing.")
      return {timestamp:timestamp.toISOString(),categories,versions:versions.map(version=>({id:version.id,bomId:version.bomId,revision:version.revision,status:version.status,name:version.bom.name,project:{id:version.bom.projectTag!.id,name:version.bom.projectTag!.name},output:version.bom.item.title,lines:version.lines.map(line=>({sourceLineKey:line.sourceLineKey,parentSourceLineKey:line.parentLine?.sourceLineKey||null,itemId:line.itemId,quantity:line.quantity.toString(),unit:line.unit,notes:line.notes,sortOrder:line.sortOrder,scrapAllowance:line.scrapAllowance?.toString()??null,consumptionRouteStepId:line.consumptionRouteStepId,applicability:line.applicability.map(entry=>({tag:entry.tag,quantity:entry.quantity.toString()}))}))})),items:items.map(item=>({id:item.id,code:item.code,title:item.title,unit:item.unit,categoryId:item.categoryId,specification:item.specification,manufacturerPartNumber:item.manufacturerPartNumber,supplyMode:item.manufacturingProfile?.supplyMode||null,onHand:item.balance?.onHand.toString()||"0",reserved:item.balance?.reserved.toString()||"0",price:item.priceHistory[0]?{...item.priceHistory[0],amount:item.priceHistory[0].amount.toString(),effectiveAt:item.priceHistory[0].effectiveAt.toISOString()}:null}))}
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
    return Response.json(result,{headers:{"Cache-Control":"no-store"}})
  }catch(error){return manufacturingDefinitionApiError(error)}
}
