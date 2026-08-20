import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError } from "@/lib/inventory-service"
export async function PATCH(request: NextRequest, context: { params: Promise<{ id:string; linkId:string }> }) {
  if (!await getSession(request)) return unauthorizedResponse()
  try { const {id,linkId}=await context.params; const body=await request.json(); const quantity=new Prisma.Decimal(body.quantity)
    if(quantity.lte(0))throw new DomainError("INVALID_QUANTITY","Link quantity must be positive")
    const link=await db.demandPurchaseLink.findUnique({where:{id:linkId},include:{purchaseRequestLine:{include:{demandLinks:true}}}})
    if(!link||link.purchaseRequestLine.purchaseRequestId!==id)throw new DomainError("LINK_NOT_FOUND","Purchase-demand link not found",404)
    const other=link.purchaseRequestLine.demandLinks.filter(x=>x.id!==linkId).reduce((n,x)=>n.plus(x.quantity),new Prisma.Decimal(0))
    if(other.plus(quantity).gt(link.purchaseRequestLine.quantity))throw new DomainError("OVER_LINKED_PURCHASE","Linked quantity exceeds purchase row quantity")
    return Response.json({link:await db.demandPurchaseLink.update({where:{id:linkId},data:{quantity}})})
  } catch(e){return apiError(e)}
}
export async function DELETE(request: NextRequest, context: { params: Promise<{ id:string; linkId:string }> }) {
  if (!await getSession(request)) return unauthorizedResponse()
  try { const {id,linkId}=await context.params; const link=await db.demandPurchaseLink.findUnique({where:{id:linkId},include:{purchaseRequestLine:true}})
    if(!link||link.purchaseRequestLine.purchaseRequestId!==id)throw new DomainError("LINK_NOT_FOUND","Purchase-demand link not found",404)
    await db.demandPurchaseLink.delete({where:{id:linkId}}); return new Response(null,{status:204})
  } catch(e){return apiError(e)}
}
