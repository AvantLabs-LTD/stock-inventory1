import { ItemPriceSource, Prisma } from "@prisma/client"
import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { runSerializable } from "@/lib/transaction"

const amount = z.union([z.string().trim(), z.number().finite().transform(String)])
  .refine(value => /^\d+(?:\.\d{1,4})?$/.test(value) && new Prisma.Decimal(value).gt(0), "Enter a positive price with at most four decimal places")
  .transform(value => new Prisma.Decimal(value))

const createPriceSchema = z.object({
  amount,
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Use a three-letter currency code").transform(value => value.toUpperCase()),
  vendorId: z.string().cuid().nullable().optional(),
  source: z.nativeEnum(ItemPriceSource).default(ItemPriceSource.MANUAL),
  effectiveAt: z.coerce.date().optional(),
  reference: z.string().trim().max(250).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
}).strict()

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.catalogue.view")) return forbiddenResponse()
  const { id } = await context.params
  const item = await db.item.findUnique({ where: { id }, select: { id: true } })
  if (!item) return Response.json({ code: "ITEM_NOT_FOUND", error: "Component was not found" }, { status: 404 })
  const prices = await db.itemPriceRecord.findMany({
    where: { itemId: id },
    include: { vendor: { select: { id: true, name: true } }, recordedBy: { select: { id: true, name: true } } },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  })
  return Response.json({ prices })
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.catalogue.manage")) return forbiddenResponse()
  try {
    const { id } = await context.params
    const input = createPriceSchema.parse(await request.json())
    const actorName = session.credential.type === "service_token" ? `${session.user.name} (API: ${session.credential.name})` : session.user.name
    const price = await runSerializable(async tx => {
      const item = await tx.item.findUnique({ where: { id }, select: { id: true, code: true, title: true } })
      if (!item) throw new PriceError("ITEM_NOT_FOUND", "Component was not found", 404)
      if (input.vendorId && !await tx.vendor.findUnique({ where: { id: input.vendorId }, select: { id: true } })) {
        throw new PriceError("VENDOR_NOT_FOUND", "Vendor was not found", 404)
      }
      const record = await tx.itemPriceRecord.create({ data: {
        itemId: id,
        vendorId: input.vendorId || null,
        amount: input.amount,
        currency: input.currency,
        source: input.source,
        effectiveAt: input.effectiveAt ?? new Date(),
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        recordedById: session.user.id,
      }, include: { vendor: { select: { id: true, name: true } }, recordedBy: { select: { id: true, name: true } } } })
      await tx.auditLog.create({ data: {
        userId: session.user.id,
        userName: actorName,
        action: "ITEM_PRICE_RECORD",
        entityType: "ItemPriceRecord",
        entityId: record.id,
        rootEntityType: "Item",
        rootEntityId: id,
        details: JSON.stringify({ itemCode: item.code, itemTitle: item.title, amount: record.amount.toString(), currency: record.currency, source: record.source, reference: record.reference }),
        metadata: { amount: record.amount.toString(), currency: record.currency, source: record.source, vendorId: record.vendorId },
      } })
      return record
    })
    return Response.json({ price }, { status: 201 })
  } catch (error) {
    if (error instanceof PriceError) return Response.json({ code: error.code, error: error.message }, { status: error.status })
    if (error instanceof z.ZodError) return Response.json({ code: "INVALID_PRICE", error: error.issues.map(issue => issue.message).join("; ") }, { status: 400 })
    console.error("Could not record item price", error)
    return Response.json({ code: "INTERNAL_ERROR", error: "Could not record item price" }, { status: 500 })
  }
}

class PriceError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message) }
}
