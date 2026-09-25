import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { runSerializable } from "@/lib/transaction"

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; priceId: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.catalogue.manage")) return forbiddenResponse()
  const { id, priceId } = await context.params
  const actorName = session.credential.type === "service_token" ? `${session.user.name} (API: ${session.credential.name})` : session.user.name
  const removed = await runSerializable(async tx => {
    const price = await tx.itemPriceRecord.findFirst({ where: { id: priceId, itemId: id }, include: { item: { select: { code: true, title: true } } } })
    if (!price) return null
    await tx.itemPriceRecord.delete({ where: { id: priceId } })
    await tx.auditLog.create({ data: { userId: session.user.id, userName: actorName, action: "DELETE_ITEM_PRICE_RECORD", entityType: "ItemPriceRecord", entityId: priceId, rootEntityType: "Item", rootEntityId: id, details: JSON.stringify({ itemCode: price.item.code, itemTitle: price.item.title, amount: price.amount.toString(), currency: price.currency, source: price.source, reference: price.reference }), metadata: { reason: "Removed by authorized user" } } })
    return price
  })
  if (!removed) return Response.json({ code: "ITEM_PRICE_NOT_FOUND", error: "Price record was not found" }, { status: 404 })
  return new Response(null, { status: 204 })
}
