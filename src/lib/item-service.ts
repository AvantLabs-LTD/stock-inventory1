import { ItemDiscipline, Prisma } from "@prisma/client"
import { DomainError } from "@/lib/inventory-service"

export function provisionalItemCode(title: string) {
  const slug = title.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 18) || "ITEM"
  return `INC-${slug}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1296).toString(36).padStart(2, "0").toUpperCase()}`
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
