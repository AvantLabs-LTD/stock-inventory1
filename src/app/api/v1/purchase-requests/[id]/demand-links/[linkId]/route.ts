import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasRole, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError } from "@/lib/inventory-service"
import { requireEditableBacklog, validateDemandCoverage } from "@/lib/purchase-service"
export async function PATCH(request: NextRequest, context: { params: Promise<{ id:string; linkId:string }> }) {
  const session=await getSession(request);if(!session)return unauthorizedResponse()
  if(!hasRole(session,"INVENTORY_MANAGER"))return forbiddenResponse()
  try { const {id,linkId}=await context.params; const body=await request.json(); const quantity=new Prisma.Decimal(body.quantity)
    if(quantity.lte(0))throw new DomainError("INVALID_QUANTITY","Link quantity must be positive")
    const updated=await db.$transaction(async tx=>{await requireEditableBacklog(tx,id)
      const link=await tx.demandPurchaseLink.findUnique({where:{id:linkId},include:{purchaseRequestLine:{include:{demandLinks:true}}}})
      if(!link||link.purchaseRequestLine.purchaseRequestId!==id)throw new DomainError("LINK_NOT_FOUND","Purchase-demand link not found",404)
      const other=link.purchaseRequestLine.demandLinks.filter(x=>x.id!==linkId).reduce((n,x)=>n.plus(x.quantity),new Prisma.Decimal(0))
      if(other.plus(quantity).gt(link.purchaseRequestLine.quantity))throw new DomainError("OVER_LINKED_PURCHASE","Linked quantity exceeds purchase row quantity")
      await validateDemandCoverage(tx,{demandLineId:link.demandLineId,itemId:link.purchaseRequestLine.itemId,quantity,existingQuantity:link.quantity})
      return tx.demandPurchaseLink.update({where:{id:linkId},data:{quantity}})
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
    return Response.json({link:updated})
  } catch(e){return apiError(e)}
}
export async function DELETE(request: NextRequest, context: { params: Promise<{ id:string; linkId:string }> }) {
  const session=await getSession(request);if(!session)return unauthorizedResponse()
  if(!hasRole(session,"INVENTORY_MANAGER"))return forbiddenResponse()
  try { const {id,linkId}=await context.params; await db.$transaction(async tx=>{await requireEditableBacklog(tx,id);const link=await tx.demandPurchaseLink.findUnique({where:{id:linkId},include:{purchaseRequestLine:true}})
    if(!link||link.purchaseRequestLine.purchaseRequestId!==id)throw new DomainError("LINK_NOT_FOUND","Purchase-demand link not found",404)
    await tx.demandPurchaseLink.delete({where:{id:linkId}})}); return new Response(null,{status:204})
  } catch(e){return apiError(e)}
}
