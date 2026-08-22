import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasRole, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError } from "@/lib/inventory-service"
import { tokenizeItemSearch } from "@/lib/item-search"

const PAGE_SIZE_DEFAULT = 200
const PAGE_SIZE_MAX = 200

function positiveInteger(value: string | null, fallback: number, maximum?: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return maximum ? Math.min(parsed, maximum) : parsed
}

async function categoryDescendants(input: { id?: string; query?: string }) {
  if (!input.id && !input.query) return []
  const seed = input.id
    ? Prisma.sql`WHERE "id" = ${input.id}`
    : Prisma.sql`WHERE "name" ILIKE ${`%${input.query}%`} OR "normalizedName" ILIKE ${`%${input.query}%`}`
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH RECURSIVE category_scope AS (
      SELECT "id" FROM "item_categories" ${seed}
      UNION
      SELECT child."id"
      FROM "item_categories" child
      INNER JOIN category_scope parent ON child."parentId" = parent."id"
    )
    SELECT "id" FROM category_scope
  `)
  return rows.map(row => row.id)
}

export async function GET(request: NextRequest) {
  if (!await getSession(request)) return unauthorizedResponse()
  const q = request.nextUrl.searchParams.get("q")?.trim()
  const rootCategoryId = request.nextUrl.searchParams.get("rootCategoryId") || undefined
  const categoryId = request.nextUrl.searchParams.get("categoryId") || undefined
  const disciplineParam = request.nextUrl.searchParams.get("discipline")
  const catalogueStateParam = request.nextUrl.searchParams.get("catalogueState")
  const statusParam = request.nextUrl.searchParams.get("status")
  const stock = request.nextUrl.searchParams.get("stock")
  const page = positiveInteger(request.nextUrl.searchParams.get("page"), 1)
  const pageSize = positiveInteger(request.nextUrl.searchParams.get("pageSize"), PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX)
  const discipline = disciplineParam === "MECHANICAL" || disciplineParam === "ELECTRONICS" ? disciplineParam : undefined
  const catalogueState = catalogueStateParam === "COMPLETE" || catalogueStateParam === "INCOMPLETE" ? catalogueStateParam : undefined
  const status = statusParam === "ACTIVE" || statusParam === "INACTIVE" || statusParam === "ARCHIVED" ? statusParam : undefined
  const searchTerms = tokenizeItemSearch(q)
  const [rootCategoryIds, categoryIds, ...searchCategoryScopes] = await Promise.all([
    rootCategoryId ? categoryDescendants({ id: rootCategoryId }) : Promise.resolve([]),
    categoryId ? categoryDescendants({ id: categoryId }) : Promise.resolve([]),
    ...searchTerms.map(term => categoryDescendants({ query: term })),
  ])
  const conditions: Prisma.ItemWhereInput[] = []
  if (rootCategoryId) conditions.push({ categoryId: { in: rootCategoryIds } })
  if (categoryId) conditions.push({ categoryId: { in: categoryIds } })
  if (discipline) conditions.push({ discipline })
  if (catalogueState) conditions.push({ catalogueState })
  if (status) conditions.push({ status })
  if (stock === "IN_STOCK") conditions.push({ balance: { is: { onHand: { gt: 0 } } } })
  if (stock === "OUT_OF_STOCK") conditions.push({ OR: [{ balance: { is: null } }, { balance: { is: { onHand: { lte: 0 } } } }] })
  if (stock === "RESERVED") conditions.push({ balance: { is: { reserved: { gt: 0 } } } })
  // Each word may match a different searchable field. For example, "20 mm braided
  // sleeve" can match "Braided sleeve" in the title and "20 mm" in specification.
  searchTerms.forEach((term, index) => {
    const searchCategoryIds = searchCategoryScopes[index] || []
    conditions.push({ OR: [
      { code: { contains: term, mode: "insensitive" } }, { title: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } }, { specification: { contains: term, mode: "insensitive" } },
      { manufacturerName: { contains: term, mode: "insensitive" } }, { manufacturerPartNumber: { contains: term, mode: "insensitive" } },
      { supplierPartNumber: { contains: term, mode: "insensitive" } }, { function: { contains: term, mode: "insensitive" } },
      { optionSelection: { contains: term, mode: "insensitive" } }, { remarks: { contains: term, mode: "insensitive" } },
      ...(searchCategoryIds.length ? [{ categoryId: { in: searchCategoryIds } } satisfies Prisma.ItemWhereInput] : []),
    ] })
  })
  const where: Prisma.ItemWhereInput = conditions.length ? { AND: conditions } : {}
  const [total, items] = await db.$transaction([
    db.item.count({ where }),
    db.item.findMany({
      where,
      include: { balance: true, category: { include: { parent: true } } },
      orderBy: [{ status: "asc" }, { title: "asc" }, { code: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])
  const itemIds = items.map(item => item.id)
  const operational = itemIds.length ? await db.$queryRaw<Array<{ itemId: string; demand: Prisma.Decimal; procurement: Prisma.Decimal; deficit: Prisma.Decimal }>>(Prisma.sql`
    SELECT "itemId",COALESCE(SUM(remaining),0) demand,
      COALESCE(SUM(backlog+"pendingApproval"+ordered+shipped),0) procurement,
      COALESCE(SUM("physicalDeficit"),0) deficit
    FROM "demand_line_supply"
    WHERE "itemId" IN (${Prisma.join(itemIds)})
    GROUP BY "itemId"
  `) : []
  const byItem = new Map(operational.map(row => [row.itemId, row]))
  return Response.json({ items: items.map(i => ({
    ...i,
    free: Number(i.balance?.onHand || 0) - Number(i.balance?.reserved || 0),
    demand: byItem.get(i.id)?.demand || 0,
    procurement: byItem.get(i.id)?.procurement || 0,
    deficit: byItem.get(i.id)?.deficit || 0,
  })), pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } })
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
