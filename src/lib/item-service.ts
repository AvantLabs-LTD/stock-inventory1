import { randomBytes } from "node:crypto"
import { ItemCatalogueState, ItemDiscipline, Prisma, RecordStatus } from "@prisma/client"
import { DomainError } from "@/lib/inventory-service"

const COMPLETE_CODE_PREFIX = "CMP"
const COMPLETE_CODE_SLUG_LENGTH = 40

export function generatedItemCodeBase(title: string) {
  const slug = title
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, COMPLETE_CODE_SLUG_LENGTH) || "ITEM"
  return `${COMPLETE_CODE_PREFIX}-${slug}`
}

export function provisionalItemCode(title: string) {
  const slug = title.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 18) || "ITEM"
  return `INC-${slug}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1296).toString(36).padStart(2, "0").toUpperCase()}`
}

type ItemWriter = Pick<Prisma.TransactionClient, "item">

type ItemEditor = Pick<Prisma.TransactionClient, "item" | "itemCategory" | "auditLog">

export type CatalogueItemUpdate = {
  title?: string
  discipline?: ItemDiscipline
  categoryId?: string | null
  catalogueState?: ItemCatalogueState
  description?: string | null
  specification?: string | null
  manufacturerName?: string | null
  manufacturerPartNumber?: string | null
  supplierPartNumber?: string | null
  function?: string | null
  link?: string | null
  optionSelection?: string | null
  remarks?: string | null
  unit?: string
  status?: RecordStatus
}

const editableItemFields = [
  "title", "discipline", "categoryId", "catalogueState", "description", "specification",
  "manufacturerName", "manufacturerPartNumber", "supplierPartNumber", "function", "link",
  "optionSelection", "remarks", "unit", "status",
] as const

export async function updateCatalogueItem(
  tx: ItemEditor,
  itemId: string,
  input: CatalogueItemUpdate,
  actor: { id: string; name: string },
) {
  const existing = await tx.item.findUnique({ where: { id: itemId } })
  if (!existing) throw new DomainError("ITEM_NOT_FOUND", "Component was not found", 404)

  const title = input.title === undefined ? existing.title : input.title.trim()
  const unit = input.unit === undefined ? existing.unit : input.unit.trim()
  if (!title) throw new DomainError("ITEM_TITLE_REQUIRED", "Enter a component name")
  if (!unit) throw new DomainError("ITEM_UNIT_REQUIRED", "Enter a unit")

  const discipline = input.discipline ?? existing.discipline
  const categoryId = input.categoryId === undefined ? existing.categoryId : input.categoryId
  const catalogueState = input.catalogueState ?? existing.catalogueState
  if (catalogueState === "COMPLETE" && !categoryId) {
    throw new DomainError("CATEGORY_REQUIRED", "A catalogue category is required for a complete component")
  }
  if (categoryId) {
    const category = await tx.itemCategory.findUnique({ where: { id: categoryId } })
    if (!category) throw new DomainError("CATEGORY_NOT_FOUND", "The selected category was not found", 404)
    if (category.discipline !== discipline) {
      throw new DomainError("CATEGORY_DISCIPLINE_MISMATCH", "Category must belong to the selected discipline")
    }
  }

  const data: Record<string, unknown> = {}
  for (const field of editableItemFields) {
    if (input[field] === undefined) continue
    const value = input[field]
    if (["description", "specification", "manufacturerName", "manufacturerPartNumber", "supplierPartNumber", "function", "link", "optionSelection", "remarks"].includes(field)) {
      data[field] = typeof value === "string" ? value.trim() || null : null
    } else {
      data[field] = value
    }
  }
  if (input.title !== undefined) data.title = title
  if (input.unit !== undefined) data.unit = unit

  const changes: Record<string, { before: unknown; after: unknown }> = {}
  for (const field of editableItemFields) {
    if (input[field] === undefined) continue
    const before = existing[field]
    const after = data[field] as unknown
    if (before !== after) changes[field] = { before, after }
  }
  if (!Object.keys(changes).length) return existing

  const updated = await tx.item.update({ where: { id: itemId }, data: data as Prisma.ItemUncheckedUpdateInput })
  await tx.auditLog.create({ data: {
    userId: actor.id,
    userName: actor.name,
    action: "UPDATE_CATALOGUE_ITEM",
    entityType: "Item",
    entityId: itemId,
    rootEntityType: "Item",
    rootEntityId: itemId,
    details: JSON.stringify({ code: existing.code, title: updated.title, changes }),
    metadata: { changedFields: Object.keys(changes) },
  } })
  return updated
}

export async function createCatalogueItem(
  tx: ItemWriter,
  input: {
    title: string
    discipline: ItemDiscipline
    categoryId: string
    catalogueState?: "COMPLETE" | "INCOMPLETE"
    description?: string | null
    specification?: string | null
    manufacturerName?: string | null
    manufacturerPartNumber?: string | null
    supplierPartNumber?: string | null
    function?: string | null
    link?: string | null
    optionSelection?: string | null
    remarks?: string | null
    unit?: string | null
  },
  actorId: string,
) {
  const title = input.title.trim()
  const codeBase = generatedItemCodeBase(title)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = attempt === 0 ? codeBase : `${codeBase}-${randomBytes(3).toString("hex").toUpperCase()}`
    try {
      return await tx.item.create({ data: {
        code,
        title,
        discipline: input.discipline,
        categoryId: input.categoryId,
        catalogueState: input.catalogueState === "INCOMPLETE" ? "INCOMPLETE" : "COMPLETE",
        description: input.description?.trim() || null,
        specification: input.specification?.trim() || null,
        manufacturerName: input.manufacturerName?.trim() || null,
        manufacturerPartNumber: input.manufacturerPartNumber?.trim() || null,
        supplierPartNumber: input.supplierPartNumber?.trim() || null,
        function: input.function?.trim() || null,
        link: input.link?.trim() || null,
        optionSelection: input.optionSelection?.trim() || null,
        remarks: input.remarks?.trim() || null,
        unit: input.unit?.trim() || "pcs",
        createdById: actorId,
        balance: { create: {} },
      }, include: { balance: true, category: true } })
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error
    }
  }
  throw new DomainError("ITEM_CODE_GENERATION_FAILED", "Could not generate a unique component code", 409)
}

export async function createIncompleteItem(
  tx: Prisma.TransactionClient,
  input: {
    title?: string
    specification?: string | null
    discipline?: ItemDiscipline
    categoryId?: string | null
    unit?: string | null
    manufacturerName?: string | null
    manufacturerPartNumber?: string | null
    supplierPartNumber?: string | null
    remarks?: string | null
  },
  actorId: string,
) {
  const title = input.title?.trim()
  if (!title) throw new DomainError("ITEM_TITLE_REQUIRED", "Enter a component name")
  const category = input.categoryId ? await tx.itemCategory.findUnique({ where: { id: input.categoryId } }) : null
  if (input.categoryId && !category) throw new DomainError("CATEGORY_NOT_FOUND", "The selected category was not found", 404)
  const discipline = category?.discipline || input.discipline
  if (!discipline) throw new DomainError("ITEM_DISCIPLINE_REQUIRED", "Choose Mechanical or Electronics")
  return tx.item.create({ data: {
    code: provisionalItemCode(title),
    title,
    discipline,
    categoryId: category?.id || null,
    catalogueState: "INCOMPLETE",
    specification: input.specification?.trim() || null,
    manufacturerName: input.manufacturerName?.trim() || null,
    manufacturerPartNumber: input.manufacturerPartNumber?.trim() || null,
    supplierPartNumber: input.supplierPartNumber?.trim() || null,
    remarks: input.remarks?.trim() || "Created from a purchase request; catalogue review required.",
    unit: input.unit?.trim() || "pcs",
    createdById: actorId,
    balance: { create: {} },
  } })
}
