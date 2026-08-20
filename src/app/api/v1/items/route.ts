import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError } from "@/lib/inventory-service"

export async function GET(request: NextRequest) {
  if (!await getSession(request)) return unauthorizedResponse()
  const q = request.nextUrl.searchParams.get("q")?.trim()
  const items = await db.item.findMany({
    where: q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }] } : undefined,
    include: { balance: true, defaultClassification: true },
    orderBy: [{ status: "asc" }, { title: "asc" }], take: 200,
  })
  return Response.json({ items: items.map(i => ({ ...i, free: Number(i.balance?.onHand || 0) - Number(i.balance?.reserved || 0) })) })
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  try {
    const body = await request.json()
    if (!body.code?.trim() || !body.title?.trim() || !["MECHANICAL", "ELECTRONICS"].includes(body.discipline)) {
      return Response.json({ error: "Code, title and discipline are required", code: "INVALID_ITEM" }, { status: 400 })
    }
    const item = await db.item.create({ data: {
      code: body.code.trim(), title: body.title.trim(), discipline: body.discipline,
      description: body.description?.trim() || null, function: body.function?.trim() || null,
      link: body.link?.trim() || null, optionSelection: body.optionSelection?.trim() || null,
      remarks: body.remarks?.trim() || null, unit: body.unit?.trim() || "pcs",
      defaultClassificationId: body.defaultClassificationId || null, createdById: session.user.id,
      balance: { create: {} },
    }, include: { balance: true, defaultClassification: true } })
    return Response.json({ item }, { status: 201 })
  } catch (error) { return apiError(error) }
}
