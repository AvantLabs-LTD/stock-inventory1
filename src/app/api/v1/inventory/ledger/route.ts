import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { tokenizeItemSearch } from "@/lib/item-search"

const PAGE_SIZE_DEFAULT = 50
const PAGE_SIZE_MAX = 200
const MOVEMENT_TYPES = ["OPENING", "RECEIPT", "ISSUE", "RETURN", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"] as const

function positiveInteger(value: string | null, fallback: number, maximum?: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return maximum ? Math.min(parsed, maximum) : parsed
}

async function categoryDescendants(id: string) {
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH RECURSIVE category_scope AS (
      SELECT "id" FROM "item_categories" WHERE "id" = ${id}
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
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.stock.view")) return forbiddenResponse()

  const params = request.nextUrl.searchParams
  const page = positiveInteger(params.get("page"), 1)
  const pageSize = positiveInteger(params.get("pageSize"), PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX)
  const rootCategoryId = params.get("rootCategoryId") || undefined
  const categoryId = params.get("categoryId") || undefined
  const disciplineParam = params.get("discipline")
  const movementTypeParam = params.get("movementType")
  const discipline = disciplineParam === "MECHANICAL" || disciplineParam === "ELECTRONICS" ? disciplineParam : undefined
  const movementType = MOVEMENT_TYPES.find(value => value === movementTypeParam)
  const searchTerms = tokenizeItemSearch(params.get("q")?.trim())
  const [rootCategoryIds, categoryIds] = await Promise.all([
    rootCategoryId ? categoryDescendants(rootCategoryId) : Promise.resolve([]),
    categoryId ? categoryDescendants(categoryId) : Promise.resolve([]),
  ])

  const itemConditions: Prisma.ItemWhereInput[] = []
  if (rootCategoryId) itemConditions.push({ categoryId: { in: rootCategoryIds } })
  if (categoryId) itemConditions.push({ categoryId: { in: categoryIds } })
  if (discipline) itemConditions.push({ discipline })
  const conditions: Prisma.InventoryLedgerEntryWhereInput[] = []
  if (itemConditions.length) conditions.push({ item: { is: { AND: itemConditions } } })
  if (movementType) conditions.push({ type: movementType })
  searchTerms.forEach(term => conditions.push({ OR: [
    { item: { is: { code: { contains: term, mode: "insensitive" } } } },
    { item: { is: { title: { contains: term, mode: "insensitive" } } } },
    { item: { is: { description: { contains: term, mode: "insensitive" } } } },
    { item: { is: { specification: { contains: term, mode: "insensitive" } } } },
    { item: { is: { manufacturerName: { contains: term, mode: "insensitive" } } } },
    { item: { is: { manufacturerPartNumber: { contains: term, mode: "insensitive" } } } },
    { remarks: { contains: term, mode: "insensitive" } },
    { sourceType: { contains: term, mode: "insensitive" } },
    { actor: { is: { name: { contains: term, mode: "insensitive" } } } },
  ] }))
  const where: Prisma.InventoryLedgerEntryWhereInput = conditions.length ? { AND: conditions } : {}

  const [total, entries] = await db.$transaction([
    db.inventoryLedgerEntry.count({ where }),
    db.inventoryLedgerEntry.findMany({
      where,
      include: {
        item: { select: { code: true, title: true, description: true, specification: true, manufacturerPartNumber: true, discipline: true, unit: true, categoryId: true } },
        actor: { select: { name: true } },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])
  return Response.json({ entries, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } })
}
