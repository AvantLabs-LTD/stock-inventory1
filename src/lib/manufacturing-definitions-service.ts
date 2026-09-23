import { randomUUID } from "node:crypto"
import { DefinitionStatus, Prisma, RecordStatus, RouteExecutionMode, RouteStepRequirementCapturePoint, RouteStepRequirementType, RouteTransitionType, SupplyMode, TrackingMode } from "@prisma/client"
import { z } from "zod"
import { db } from "@/lib/db"
import { IdempotencyError, completeIdempotentRequest, replayOrStartIdempotentRequest } from "@/lib/idempotency"
import { runSerializable } from "@/lib/transaction"

type Actor = { id: string; name: string }
type Tx = Prisma.TransactionClient

export class ManufacturingDefinitionError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message) }
}

export function manufacturingDefinitionApiError(error: unknown) {
  if (error instanceof ManufacturingDefinitionError) return Response.json({ code: error.code, error: error.message }, { status: error.status })
  if (error instanceof IdempotencyError) return Response.json({ code: error.code, error: error.message }, { status: error.status })
  if (error instanceof z.ZodError) return Response.json({ code: "INVALID_INPUT", error: error.issues.map(issue => issue.message).join("; ") }, { status: 400 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ code: "CONFLICT", error: "A record with this identifier already exists" }, { status: 409 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return Response.json({ code: "INVALID_REFERENCE", error: "A related record was not found" }, { status: 400 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return Response.json({ code: "CONCURRENT_UPDATE", error: "Concurrent definition update; retry" }, { status: 409 })
  console.error("Manufacturing definition operation failed", error)
  return Response.json({ code: "INTERNAL_ERROR", error: "Manufacturing definition operation failed" }, { status: 500 })
}

const id = z.string().trim().min(1).max(100)
const text = z.string().trim().min(1).max(250)
const optionalText = z.string().trim().max(4000).nullish().transform(value => value || null)
const optionalId = id.nullish().transform(value => value || null)
const decimal = z.union([z.string().trim(), z.number().finite().transform(String)]).refine(value => /^\d+(?:\.\d{1,6})?$/.test(value) && new Prisma.Decimal(value).gt(0), "Use a positive decimal with at most 6 decimal places").transform(value => new Prisma.Decimal(value))
const nonnegativeDecimal = z.union([z.string().trim(), z.number().finite().transform(String)]).refine(value => /^\d+(?:\.\d{1,6})?$/.test(value), "Use a nonnegative decimal with at most 6 decimal places").transform(value => new Prisma.Decimal(value))

const requirementSchema = z.object({
  requirementType: z.nativeEnum(RouteStepRequirementType),
  key: z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,63}$/, "Use an uppercase requirement key such as OPERATOR"),
  label: text,
  requiredAt: z.nativeEnum(RouteStepRequirementCapturePoint),
  required: z.boolean().default(false),
  allowMultiple: z.boolean().default(false),
  sequence: z.number().int().min(0).max(10000).optional(),
})

const bomLineApplicabilitySchema = z.object({
  tag: z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,63}$/, "Use an uppercase applicability tag such as PMU_MAIN"),
  quantity: decimal,
})

const bomLineSchema = z.object({
  sourceLineKey: z.string().trim().min(1).max(100),
  parentSourceLineKey: z.string().trim().min(1).max(100).nullish().transform(value => value || null),
  itemId: id,
  quantity: decimal,
  unit: z.string().trim().max(50).nullish().transform(value => value || null),
  scrapAllowance: nonnegativeDecimal.nullish().transform(value => value ?? null),
  consumptionRouteStepId: optionalId,
  notes: optionalText,
  sortOrder: z.number().int().min(0).max(100000).optional(),
  applicability: z.array(bomLineApplicabilitySchema).max(10).default([]),
}).superRefine((line, context) => {
  const tags = new Set<string>()
  line.applicability.forEach((entry, index) => {
    if (tags.has(entry.tag)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["applicability", index, "tag"], message: "Applicability tags must be unique per BOM line" })
    tags.add(entry.tag)
  })
})

function serializableBomLine(line: z.infer<typeof bomLineSchema>) {
  return {
    ...line,
    quantity: line.quantity.toString(),
    scrapAllowance: line.scrapAllowance?.toString() ?? null,
    applicability: line.applicability.map(entry => ({ tag: entry.tag, quantity: entry.quantity.toString() })),
  }
}

const routeStepSchema = z.object({
  operationId: id,
  nameOverride: optionalText,
  workCenterId: optionalId,
  executionMode: z.nativeEnum(RouteExecutionMode).default(RouteExecutionMode.INTERNAL),
  isSerializationPoint: z.boolean().default(false),
  active: z.boolean().default(true),
  requirements: z.array(requirementSchema).max(30).default([]),
})

export function validateBomHierarchy(lines: Array<{ sourceLineKey: string; parentSourceLineKey: string | null }>) {
  const byKey = new Map(lines.map(line => [line.sourceLineKey, line]))
  if (byKey.size !== lines.length) throw new ManufacturingDefinitionError("DUPLICATE_SOURCE_LINE_KEY", "Each BOM line needs a unique source line key")
  for (const line of lines) {
    if (line.parentSourceLineKey && !byKey.has(line.parentSourceLineKey)) {
      throw new ManufacturingDefinitionError("MISSING_BOM_PARENT", `BOM parent ${line.parentSourceLineKey} was not found`)
    }
  }
  for (const line of lines) {
    const visited = new Set<string>()
    let current: typeof line | undefined = line
    while (current?.parentSourceLineKey) {
      if (visited.has(current.sourceLineKey)) throw new ManufacturingDefinitionError("BOM_CYCLE", "BOM hierarchy contains a cycle")
      visited.add(current.sourceLineKey)
      current = byKey.get(current.parentSourceLineKey)
    }
  }
}

async function audit(tx: Tx, actor: Actor, action: string, entityType: string, entityId: string, details: unknown) {
  await tx.auditLog.create({ data: { userId: actor.id, userName: actor.name, action, entityType, entityId, details: JSON.stringify(details) } })
}

export async function listManufacturingDefinitions() {
  const [profiles, boms, routes, operations, workCenters, resources] = await Promise.all([
    db.manufacturingProfile.findMany({
      include: { item: { select: { id: true, code: true, title: true, unit: true } }, defaultBomVersion: { select: { id: true, revision: true, status: true } }, defaultRouteVersion: { select: { id: true, revision: true, status: true } } },
      orderBy: { item: { title: "asc" } },
    }),
    db.billOfMaterial.findMany({ include: { item: { select: { id: true, code: true, title: true, unit: true } }, projectTag: { select: { id: true, name: true } }, versions: { orderBy: { createdAt: "desc" }, include: { _count: { select: { lines: true } } } } }, orderBy: { updatedAt: "desc" } }),
    db.manufacturingRoute.findMany({ include: { item: { select: { id: true, code: true, title: true } }, versions: { orderBy: { createdAt: "desc" }, include: { _count: { select: { steps: true } } } } }, orderBy: { updatedAt: "desc" } }),
    db.manufacturingOperation.findMany({ include: { defaultWorkCenter: { select: { id: true, code: true, name: true } } }, orderBy: { name: "asc" } }),
    db.workCenter.findMany({ orderBy: { name: "asc" } }),
    db.productionResource.findMany({ include: { workCenter: { select: { id: true, code: true, name: true } } }, orderBy: { name: "asc" } }),
  ])
  return { profiles, boms, routes, operations, workCenters, resources }
}

export async function bomDetail(id: string) {
  const bom = await db.billOfMaterial.findUnique({
    where: { id },
    include: {
      item: { select: { id: true, code: true, title: true, unit: true } },
      projectTag: { select: { id: true, name: true } },
      versions: {
        orderBy: { createdAt: "desc" },
        include: {
          lines: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include: {
              item: { select: { id: true, code: true, title: true, unit: true } },
              applicability: { orderBy: { tag: "asc" } },
              parentLine: { select: { id: true, sourceLineKey: true } },
              consumptionRouteStep: { select: { id: true, sequence: true, operation: { select: { code: true, name: true } } } },
            },
          },
        },
      },
    },
  })
  if (!bom) throw new ManufacturingDefinitionError("BOM_NOT_FOUND", "BOM was not found", 404)
  return bom
}

export async function routeDetail(id: string) {
  const route = await db.manufacturingRoute.findUnique({
    where: { id },
    include: {
      item: { select: { id: true, code: true, title: true } },
      versions: {
        orderBy: { createdAt: "desc" },
        include: {
          steps: { orderBy: { sequence: "asc" }, include: { operation: true, workCenter: true, requirements: { orderBy: { sequence: "asc" } } } },
          transitions: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  })
  if (!route) throw new ManufacturingDefinitionError("ROUTE_NOT_FOUND", "Route was not found", 404)
  return route
}

export async function createManufacturingProfile(raw: unknown, actor: Actor) {
  const input = z.object({ itemId: id, supplyMode: z.nativeEnum(SupplyMode), trackingMode: z.nativeEnum(TrackingMode).default(TrackingMode.QUANTITY), defaultBomVersionId: optionalId, defaultRouteVersionId: optionalId, traceInFinishedProduct: z.boolean().default(false) }).parse(raw)
  return runSerializable(async tx => {
    const item = await tx.item.findUnique({ where: { id: input.itemId }, select: { id: true } })
    if (!item) throw new ManufacturingDefinitionError("ITEM_NOT_FOUND", "Manufacturing profile item was not found", 404)
    if (input.defaultBomVersionId) {
      const version = await tx.bomVersion.findUnique({ where: { id: input.defaultBomVersionId }, include: { bom: true } })
      if (!version || version.status !== DefinitionStatus.ACTIVE || version.bom.itemId !== input.itemId) throw new ManufacturingDefinitionError("INVALID_DEFAULT_BOM", "Choose an active BOM version for the same item")
    }
    if (input.defaultRouteVersionId) {
      const version = await tx.routeVersion.findUnique({ where: { id: input.defaultRouteVersionId }, include: { route: true } })
      if (!version || version.status !== DefinitionStatus.ACTIVE || (version.route.itemId && version.route.itemId !== input.itemId)) throw new ManufacturingDefinitionError("INVALID_DEFAULT_ROUTE", "Choose an active route applicable to this item")
    }
    const profile = await tx.manufacturingProfile.upsert({ where: { itemId: input.itemId }, update: input, create: input })
    await audit(tx, actor, "MANUFACTURING_PROFILE_SAVE", "ManufacturingProfile", profile.id, input)
    return profile
  })
}

export async function createBillOfMaterial(raw: unknown, actor: Actor, idempotencyKey: string | null = null) {
  const input = z.object({ bomId: optionalId, itemId: id, projectTagId: optionalId, name: text, revision: text, effectiveFrom: z.coerce.date().nullish().transform(value => value ?? null), effectiveTo: z.coerce.date().nullish().transform(value => value ?? null), lines: z.array(bomLineSchema).min(1).max(1000) }).parse(raw)
  validateBomHierarchy(input.lines)
  if (input.effectiveFrom && input.effectiveTo && input.effectiveTo < input.effectiveFrom) throw new ManufacturingDefinitionError("INVALID_EFFECTIVITY", "Effective end cannot precede effective start")
  return runSerializable(async tx => {
    const replay = await replayOrStartIdempotentRequest(tx, {
      actorId: actor.id,
      key: idempotencyKey,
      action: "manufacturing.bom.create",
      payload: {
        ...input,
        effectiveFrom: input.effectiveFrom?.toISOString() ?? null,
        effectiveTo: input.effectiveTo?.toISOString() ?? null,
        lines: input.lines.map(serializableBomLine),
      },
    })
    if (replay) return replay as unknown as Awaited<ReturnType<typeof bomDetail>>
    const itemIds = [...new Set([input.itemId, ...input.lines.map(line => line.itemId)])]
    const found = await tx.item.findMany({ where: { id: { in: itemIds } }, select: { id: true } })
    if (found.length !== itemIds.length) throw new ManufacturingDefinitionError("ITEM_NOT_FOUND", "One or more BOM components were not found", 404)
    if (input.projectTagId && !await tx.projectTag.findUnique({ where: { id: input.projectTagId }, select: { id: true } })) throw new ManufacturingDefinitionError("PROJECT_NOT_FOUND", "Project was not found", 404)
    const stepIds = input.lines.flatMap(line => line.consumptionRouteStepId ? [line.consumptionRouteStepId] : [])
    if (stepIds.length && (await tx.routeStep.count({ where: { id: { in: stepIds } } })) !== new Set(stepIds).size) throw new ManufacturingDefinitionError("ROUTE_STEP_NOT_FOUND", "A BOM consumption step was not found", 404)
    const existingBom = input.bomId
      ? await tx.billOfMaterial.findUnique({ where: { id: input.bomId }, select: { id: true, itemId: true, projectTagId: true, name: true } })
      : null
    if (input.bomId && !existingBom) throw new ManufacturingDefinitionError("BOM_NOT_FOUND", "BOM was not found", 404)
    if (existingBom && (existingBom.itemId !== input.itemId || existingBom.projectTagId !== input.projectTagId || existingBom.name !== input.name)) {
      throw new ManufacturingDefinitionError("IMMUTABLE_BOM_IDENTITY", "A new revision cannot change its BOM item, project scope, or name")
    }
    const bom = existingBom ?? await tx.billOfMaterial.create({ data: { itemId: input.itemId, projectTagId: input.projectTagId, name: input.name, createdById: actor.id } })
    const version = await tx.bomVersion.create({ data: { bomId: bom.id, revision: input.revision, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, createdById: actor.id } })
    const idsByKey = new Map(input.lines.map(line => [line.sourceLineKey, randomUUID()]))
    for (const [index, line] of input.lines.entries()) {
      await tx.bomLine.create({ data: { id: idsByKey.get(line.sourceLineKey), bomVersionId: version.id, itemId: line.itemId, parentLineId: line.parentSourceLineKey ? idsByKey.get(line.parentSourceLineKey) : null, sourceLineKey: line.sourceLineKey, quantity: line.quantity, unit: line.unit, scrapAllowance: line.scrapAllowance, consumptionRouteStepId: line.consumptionRouteStepId, notes: line.notes, sortOrder: line.sortOrder ?? index, applicability: { create: line.applicability } } })
    }
    await audit(tx, actor, input.bomId ? "MANUFACTURING_BOM_VERSION_CREATE" : "MANUFACTURING_BOM_CREATE", "BillOfMaterial", bom.id, { ...input, lines: input.lines.map(serializableBomLine) })
    const result = await tx.billOfMaterial.findUniqueOrThrow({ where: { id: bom.id }, include: { versions: { include: { lines: true } } } })
    await completeIdempotentRequest(tx, { actorId: actor.id, key: idempotencyKey, response: result })
    return result
  })
}

/** Draft definitions are editable because they are not released history. Once
 * active, the only supported change is a new revision. */
export async function replaceDraftBomVersion(versionId: string, raw: unknown, actor: Actor, idempotencyKey: string | null = null) {
  const input = z.object({ lines: z.array(bomLineSchema).min(1).max(1000) }).parse(raw)
  validateBomHierarchy(input.lines)
  return runSerializable(async tx => {
    const replay = await replayOrStartIdempotentRequest(tx, {
      actorId: actor.id,
      key: idempotencyKey,
      action: "manufacturing.bom-version.replace-draft",
      payload: { versionId, lines: input.lines.map(serializableBomLine) },
    })
    if (replay) return replay as unknown
    const version = await tx.bomVersion.findUnique({ where: { id: versionId }, include: { lines: { select: { id: true } } } })
    if (!version) throw new ManufacturingDefinitionError("BOM_VERSION_NOT_FOUND", "BOM version was not found", 404)
    if (version.status !== DefinitionStatus.DRAFT) throw new ManufacturingDefinitionError("BOM_VERSION_IMMUTABLE", "Only Draft BOM revisions may be corrected")
    const itemIds = [...new Set(input.lines.map(line => line.itemId))]
    if ((await tx.item.count({ where: { id: { in: itemIds } } })) !== itemIds.length) throw new ManufacturingDefinitionError("ITEM_NOT_FOUND", "One or more BOM components were not found", 404)
    const stepIds = [...new Set(input.lines.flatMap(line => line.consumptionRouteStepId ? [line.consumptionRouteStepId] : []))]
    if (stepIds.length && (await tx.routeStep.count({ where: { id: { in: stepIds } } })) !== stepIds.length) throw new ManufacturingDefinitionError("ROUTE_STEP_NOT_FOUND", "A BOM consumption step was not found", 404)
    // Parent links are removed first so this remains valid for hierarchical Drafts.
    await tx.bomLine.updateMany({ where: { bomVersionId: versionId, parentLineId: { not: null } }, data: { parentLineId: null } })
    await tx.bomLine.deleteMany({ where: { bomVersionId: versionId } })
    const idsByKey = new Map(input.lines.map(line => [line.sourceLineKey, randomUUID()]))
    for (const [index, line] of input.lines.entries()) {
      await tx.bomLine.create({ data: { id: idsByKey.get(line.sourceLineKey), bomVersionId: versionId, itemId: line.itemId, parentLineId: line.parentSourceLineKey ? idsByKey.get(line.parentSourceLineKey) : null, sourceLineKey: line.sourceLineKey, quantity: line.quantity, unit: line.unit, scrapAllowance: line.scrapAllowance, consumptionRouteStepId: line.consumptionRouteStepId, notes: line.notes, sortOrder: line.sortOrder ?? index, applicability: { create: line.applicability } } })
    }
    const result = await tx.bomVersion.findUniqueOrThrow({ where: { id: versionId }, include: { lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { item: { select: { id: true, code: true, title: true, unit: true } }, applicability: { orderBy: { tag: "asc" } } } } } })
    await audit(tx, actor, "MANUFACTURING_BOM_VERSION_DRAFT_REPLACE", "BomVersion", versionId, { bomId: version.bomId, replacedLineCount: version.lines.length, lines: input.lines.map(serializableBomLine) })
    await completeIdempotentRequest(tx, { actorId: actor.id, key: idempotencyKey, response: result })
    return result
  })
}

export async function createManufacturingRoute(raw: unknown, actor: Actor) {
  const input = z.object({ routeId: optionalId, itemId: optionalId, name: text, description: optionalText, revision: text, effectiveFrom: z.coerce.date().nullish().transform(value => value ?? null), effectiveTo: z.coerce.date().nullish().transform(value => value ?? null), steps: z.array(routeStepSchema).min(1).max(100).superRefine((steps, context) => {
    if (steps.filter(step => step.isSerializationPoint).length > 1) context.addIssue({ code: z.ZodIssueCode.custom, message: "A route version may have only one serialization point" })
    steps.forEach((step, index) => {
      const keys = new Set<string>()
      step.requirements.forEach(requirement => {
        if (keys.has(requirement.key)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "requirements"], message: "Requirement keys must be unique within a route step" })
        keys.add(requirement.key)
      })
    })
  }), reworkTransitions: z.array(z.object({ fromSequence: z.number().int().min(1), toSequence: z.number().int().min(1), transitionType: z.enum([RouteTransitionType.REWORK, RouteTransitionType.ALTERNATIVE]).default(RouteTransitionType.REWORK) })).max(100).default([]) }).parse(raw)
  if (input.effectiveFrom && input.effectiveTo && input.effectiveTo < input.effectiveFrom) throw new ManufacturingDefinitionError("INVALID_EFFECTIVITY", "Effective end cannot precede effective start")
  return runSerializable(async tx => {
    if (input.itemId && !await tx.item.findUnique({ where: { id: input.itemId }, select: { id: true } })) throw new ManufacturingDefinitionError("ITEM_NOT_FOUND", "Route item was not found", 404)
    const operationIds = [...new Set(input.steps.map(step => step.operationId))]
    if ((await tx.manufacturingOperation.count({ where: { id: { in: operationIds }, status: RecordStatus.ACTIVE } })) !== operationIds.length) throw new ManufacturingDefinitionError("OPERATION_NOT_FOUND", "Every route step needs an active manufacturing operation", 404)
    const workCenterIds = [...new Set(input.steps.flatMap(step => step.workCenterId ? [step.workCenterId] : []))]
    if (workCenterIds.length && (await tx.workCenter.count({ where: { id: { in: workCenterIds }, status: RecordStatus.ACTIVE } })) !== workCenterIds.length) throw new ManufacturingDefinitionError("WORK_CENTER_NOT_FOUND", "A selected work center was not found or is inactive", 404)
    const existingRoute = input.routeId
      ? await tx.manufacturingRoute.findUnique({ where: { id: input.routeId }, select: { id: true, itemId: true, name: true, description: true } })
      : null
    if (input.routeId && !existingRoute) throw new ManufacturingDefinitionError("ROUTE_NOT_FOUND", "Route was not found", 404)
    if (existingRoute && (existingRoute.itemId !== input.itemId || existingRoute.name !== input.name || existingRoute.description !== input.description)) {
      throw new ManufacturingDefinitionError("IMMUTABLE_ROUTE_IDENTITY", "A new revision cannot change its route item, name, or description")
    }
    const route = existingRoute ?? await tx.manufacturingRoute.create({ data: { itemId: input.itemId, name: input.name, description: input.description, createdById: actor.id } })
    const version = await tx.routeVersion.create({ data: { routeId: route.id, revision: input.revision, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, createdById: actor.id } })
    const stepIds: string[] = []
    for (const [index, step] of input.steps.entries()) {
      const stepId = randomUUID(); stepIds.push(stepId)
      await tx.routeStep.create({ data: { id: stepId, routeVersionId: version.id, operationId: step.operationId, sequence: index + 1, nameOverride: step.nameOverride, workCenterId: step.workCenterId, executionMode: step.executionMode, isSerializationPoint: step.isSerializationPoint, active: step.active, requirements: { create: step.requirements.map((requirement, requirementIndex) => ({ ...requirement, sequence: requirement.sequence ?? requirementIndex })) } } })
    }
    for (let index = 0; index + 1 < stepIds.length; index += 1) await tx.routeTransition.create({ data: { routeVersionId: version.id, fromStepId: stepIds[index], toStepId: stepIds[index + 1], transitionType: RouteTransitionType.NORMAL } })
    for (const transition of input.reworkTransitions) {
      const fromStepId = stepIds[transition.fromSequence - 1], toStepId = stepIds[transition.toSequence - 1]
      if (!fromStepId || !toStepId || fromStepId === toStepId) throw new ManufacturingDefinitionError("INVALID_ROUTE_TRANSITION", "Rework transition references an invalid route step")
      await tx.routeTransition.create({ data: { routeVersionId: version.id, fromStepId, toStepId, transitionType: transition.transitionType } })
    }
    await audit(tx, actor, input.routeId ? "MANUFACTURING_ROUTE_VERSION_CREATE" : "MANUFACTURING_ROUTE_CREATE", "ManufacturingRoute", route.id, { ...input, steps: input.steps.map(step => ({ ...step, requirements: step.requirements })) })
    return tx.manufacturingRoute.findUniqueOrThrow({ where: { id: route.id }, include: { versions: { include: { steps: { include: { requirements: true } }, transitions: true } } } })
  })
}

export async function activateBomVersion(versionId: string, actor: Actor) {
  return runSerializable(async tx => {
    const version = await tx.bomVersion.findUnique({ where: { id: versionId }, include: { lines: true } })
    if (!version) throw new ManufacturingDefinitionError("BOM_VERSION_NOT_FOUND", "BOM version was not found", 404)
    if (version.status === DefinitionStatus.RETIRED) throw new ManufacturingDefinitionError("BOM_VERSION_RETIRED", "Retired BOM versions cannot be activated")
    if (!version.lines.length) throw new ManufacturingDefinitionError("BOM_LINES_REQUIRED", "A BOM version needs at least one line")
    await tx.bomVersion.updateMany({ where: { bomId: version.bomId, status: DefinitionStatus.ACTIVE, id: { not: version.id } }, data: { status: DefinitionStatus.RETIRED } })
    const active = await tx.bomVersion.update({ where: { id: version.id }, data: { status: DefinitionStatus.ACTIVE, approvedAt: new Date(), approvedById: actor.id } })
    await audit(tx, actor, "MANUFACTURING_BOM_VERSION_ACTIVATE", "BomVersion", version.id, { bomId: version.bomId, revision: version.revision })
    return active
  })
}

export async function activateRouteVersion(versionId: string, actor: Actor) {
  return runSerializable(async tx => {
    const version = await tx.routeVersion.findUnique({ where: { id: versionId }, include: { steps: { include: { requirements: true } }, transitions: true } })
    if (!version) throw new ManufacturingDefinitionError("ROUTE_VERSION_NOT_FOUND", "Route version was not found", 404)
    if (version.status === DefinitionStatus.RETIRED) throw new ManufacturingDefinitionError("ROUTE_VERSION_RETIRED", "Retired route versions cannot be activated")
    if (!version.steps.length) throw new ManufacturingDefinitionError("ROUTE_STEPS_REQUIRED", "A route version needs at least one step")
    const normal = version.transitions.filter(transition => transition.transitionType === RouteTransitionType.NORMAL)
    if (normal.length !== Math.max(version.steps.length - 1, 0)) throw new ManufacturingDefinitionError("ROUTE_NORMAL_TRANSITIONS_REQUIRED", "A linear route needs one normal transition between each consecutive step")
    await tx.routeVersion.updateMany({ where: { routeId: version.routeId, status: DefinitionStatus.ACTIVE, id: { not: version.id } }, data: { status: DefinitionStatus.RETIRED } })
    const active = await tx.routeVersion.update({ where: { id: version.id }, data: { status: DefinitionStatus.ACTIVE, approvedAt: new Date(), approvedById: actor.id } })
    await audit(tx, actor, "MANUFACTURING_ROUTE_VERSION_ACTIVATE", "RouteVersion", version.id, { routeId: version.routeId, revision: version.revision })
    return active
  })
}

export async function saveReferenceDefinition(kind: "operation" | "work-center" | "resource", raw: unknown, actor: Actor) {
  if (kind === "operation") {
    const input = z.object({ id: optionalId, code: text, name: text, description: optionalText, defaultWorkCenterId: optionalId, status: z.nativeEnum(RecordStatus).default(RecordStatus.ACTIVE) }).parse(raw)
    return runSerializable(async tx => {
      if (input.defaultWorkCenterId && !await tx.workCenter.findUnique({ where: { id: input.defaultWorkCenterId }, select: { id: true } })) throw new ManufacturingDefinitionError("WORK_CENTER_NOT_FOUND", "Default work center was not found", 404)
      const { id: operationId, ...data } = input
      const record = operationId ? await tx.manufacturingOperation.update({ where: { id: operationId }, data }) : await tx.manufacturingOperation.create({ data })
      await audit(tx, actor, operationId ? "MANUFACTURING_OPERATION_UPDATE" : "MANUFACTURING_OPERATION_CREATE", "ManufacturingOperation", record.id, data)
      return record
    })
  }
  if (kind === "work-center") {
    const input = z.object({ id: optionalId, code: text, name: text, description: optionalText, status: z.nativeEnum(RecordStatus).default(RecordStatus.ACTIVE) }).parse(raw)
    return runSerializable(async tx => {
      const { id: workCenterId, ...data } = input
      const record = workCenterId ? await tx.workCenter.update({ where: { id: workCenterId }, data }) : await tx.workCenter.create({ data })
      await audit(tx, actor, workCenterId ? "WORK_CENTER_UPDATE" : "WORK_CENTER_CREATE", "WorkCenter", record.id, data)
      return record
    })
  }
  const input = z.object({ id: optionalId, code: text, name: text, resourceType: z.enum(["CNC_MACHINE", "LATHE", "MILL", "THREE_D_PRINTER", "REFLOW_OVEN", "TEST_BENCH", "ASSEMBLY_STATION", "OTHER"]), workCenterId: optionalId, status: z.enum(["AVAILABLE", "UNAVAILABLE", "RETIRED"]).default("AVAILABLE"), metadata: z.record(z.string(), z.unknown()).nullish().transform(value => value ?? null) }).parse(raw)
  return runSerializable(async tx => {
    if (input.workCenterId && !await tx.workCenter.findUnique({ where: { id: input.workCenterId }, select: { id: true } })) throw new ManufacturingDefinitionError("WORK_CENTER_NOT_FOUND", "Resource work center was not found", 404)
    const { id: resourceId, metadata, ...rest } = input
    const data = { ...rest, metadata: metadata ? metadata as Prisma.InputJsonValue : Prisma.JsonNull }
    const record = resourceId ? await tx.productionResource.update({ where: { id: resourceId }, data }) : await tx.productionResource.create({ data })
    await audit(tx, actor, resourceId ? "PRODUCTION_RESOURCE_UPDATE" : "PRODUCTION_RESOURCE_CREATE", "ProductionResource", record.id, data)
    return record
  })
}
