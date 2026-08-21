import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasRole, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError } from "@/lib/inventory-service"

export async function GET(request: NextRequest) {
  if (!await getSession(request)) return unauthorizedResponse()
  const q = request.nextUrl.searchParams.get("q")?.trim()
  const categoryId = request.nextUrl.searchParams.get("categoryId") || undefined
  const discipline = request.nextUrl.searchParams.get("discipline") as "MECHANICAL" | "ELECTRONICS" | null
  const items = await db.item.findMany({
    where: {
      categoryId,
      discipline: discipline || undefined,
      OR: q ? [
        { code: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } }, { specification: { contains: q, mode: "insensitive" } },
        { manufacturerName: { contains: q, mode: "insensitive" } }, { manufacturerPartNumber: { contains: q, mode: "insensitive" } },
        { supplierPartNumber: { contains: q, mode: "insensitive" } },
      ] : undefined,
    },
    include: { balance: true, category: { include: { parent: true } } },
    orderBy: [{ status: "asc" }, { title: "asc" }], take: 200,
  })
  const operational = await db.$queryRaw<Array<{ itemId: string; demand: Prisma.Decimal; procurement: Prisma.Decimal; deficit: Prisma.Decimal }>>
    `SELECT "itemId",COALESCE(SUM(remaining),0) demand,
      COALESCE(SUM(backlog+"pendingApproval"+ordered+shipped),0) procurement,
      COALESCE(SUM("physicalDeficit"),0) deficit
     FROM "demand_line_supply" WHERE "itemId" IS NOT NULL GROUP BY "itemId"`
  const byItem = new Map(operational.map(row => [row.itemId, row]))
  return Response.json({ items: items.map(i => ({
    ...i,
    free: Number(i.balance?.onHand || 0) - Number(i.balance?.reserved || 0),
    demand: byItem.get(i.id)?.demand || 0,
    procurement: byItem.get(i.id)?.procurement || 0,
    deficit: byItem.get(i.id)?.deficit || 0,
  })) })
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasRole(session, "INVENTORY_MANAGER")) return forbiddenResponse()
  try {
    const body = await request.json()
    if (!body.code?.trim() || !body.title?.trim() || !["MECHANICAL", "ELECTRONICS"].includes(body.discipline)) {
      return Response.json({ error: "Code, title and discipline are required", code: "INVALID_ITEM" }, { status: 400 })
    }
    if (!body.categoryId) return Response.json({ error: "A catalogue category is required for a complete component", code: "CATEGORY_REQUIRED" }, { status: 400 })
    const category = await db.itemCategory.findUnique({ where: { id: body.categoryId } })
    if (!category || category.discipline !== body.discipline) return Response.json({ error: "Category must belong to the selected discipline", code: "CATEGORY_DISCIPLINE_MISMATCH" }, { status: 400 })
    const item = await db.item.create({ data: {
      code: body.code.trim(), title: body.title.trim(), discipline: body.discipline, categoryId: category.id,
      catalogueState: body.catalogueState === "INCOMPLETE" ? "INCOMPLETE" : "COMPLETE",
      description: body.description?.trim() || null, function: body.function?.trim() || null,
      specification: body.specification?.trim() || null, manufacturerName: body.manufacturerName?.trim() || null,
      manufacturerPartNumber: body.manufacturerPartNumber?.trim() || null, supplierPartNumber: body.supplierPartNumber?.trim() || null,
      link: body.link?.trim() || null, optionSelection: body.optionSelection?.trim() || null,
      remarks: body.remarks?.trim() || null, unit: body.unit?.trim() || "pcs",
      createdById: session.user.id,
      balance: { create: {} },
    }, include: { balance: true, category: true } })
    return Response.json({ item }, { status: 201 })
  } catch (error) { return apiError(error) }
}
