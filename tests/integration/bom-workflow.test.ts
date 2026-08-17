import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { ComponentDiscipline, Prisma, ProjectBomUploadStatus } from '@prisma/client'
import { db } from '../../src/lib/db'
import { validateBomHierarchy, type BomImportRow } from '../../src/lib/inventory/bom-import'
import { acceptBomUpload, BomDomainError, createBomUpload, reconcileBomLine } from '../../src/lib/inventory/bom-service'
import { getProjectComponentRequirements } from '../../src/lib/inventory/project-requirements'
import { hasPermission, ROLES } from '../../src/lib/permissions'

const enabled = process.env.RUN_INTEGRATION_TESTS === '1'
const run = enabled ? test : test.skip
const suffix = randomUUID().slice(0, 8)

let userId: string
let departmentId: string
let projectId: string
let existingComponentId: string
const createdComponentIds: string[] = []

function row(
  input: Omit<Partial<BomImportRow>, 'quantity'>
    & Pick<BomImportRow, 'lineId' | 'title'>
    & { quantity: number | string | Prisma.Decimal }
): BomImportRow {
  return {
    lineId: input.lineId,
    parentLineId: input.parentLineId ?? null,
    title: input.title,
    discipline: input.discipline ?? ComponentDiscipline.MECHANICAL,
    description: input.description ?? `${input.title} description`,
    function: null,
    link: null,
    optionSelection: null,
    remarks: null,
    quantity: new Prisma.Decimal(input.quantity),
    sortOrder: input.sortOrder ?? 0,
  }
}

before(async () => {
  if (!enabled) return
  const user = await db.user.create({
    data: {
      email: `bom-${suffix}@localhost`,
      password: 'not-used',
      name: 'BOM Integration Manager',
      role: ROLES.INVENTORY_MANAGER,
    },
  })
  userId = user.id
  const department = await db.department.create({
    data: { name: `BOM Department ${suffix}`, code: `BOM-D-${suffix}` },
  })
  departmentId = department.id
  const project = await db.project.create({
    data: { name: `BOM Project ${suffix}`, code: `BOM-P-${suffix}`, departmentId },
  })
  projectId = project.id
  const component = await db.component.create({
    data: {
      code: `EXIST-${suffix}`,
      title: 'Existing Parent A',
      discipline: ComponentDiscipline.MECHANICAL,
      description: 'Existing component for reconciliation',
      createdById: userId,
      balance: { create: {} },
    },
  })
  existingComponentId = component.id
})

after(async () => {
  if (!enabled) return
  await db.projectBomUpload.deleteMany({ where: { projectId } })
  await db.componentBalance.deleteMany({ where: { componentId: { in: [existingComponentId, ...createdComponentIds] } } })
  await db.component.deleteMany({ where: { id: { in: [existingComponentId, ...createdComponentIds] } } })
  await db.project.delete({ where: { id: projectId } })
  await db.department.delete({ where: { id: departmentId } })
  await db.user.delete({ where: { id: userId } })
  await db.$disconnect()
})

test('final roles enforce canonical responsibilities', () => {
  assert.equal(hasPermission(ROLES.USER, 'components', 'view'), true)
  assert.equal(hasPermission(ROLES.USER, 'components', 'create'), false)
  assert.equal(hasPermission(ROLES.INVENTORY_MANAGER, 'project_bom', 'approve'), true)
  assert.equal(hasPermission(ROLES.PURCHASE_APPROVER, 'purchase_requests', 'approve'), true)
  assert.equal(hasPermission(ROLES.PURCHASE_APPROVER, 'components', 'edit'), false)
})

test('hierarchy validation rejects cycles before any database write', () => {
  assert.throws(
    () => validateBomHierarchy([
      row({ lineId: 'A', parentLineId: 'B', title: 'A', quantity: 1 }),
      row({ lineId: 'B', parentLineId: 'A', title: 'B', quantity: 1 }),
    ]),
    /cycle/i
  )
})

run('stages, reconciles, and atomically accepts hierarchical BOMs', async () => {
  const upload = await createBomUpload({
    projectId,
    fileName: 'first.xlsx',
    sheetName: 'Project BOM',
    uploadedById: userId,
    rows: [
      row({ lineId: 'A', title: 'Existing Parent A', quantity: 10, sortOrder: 0 }),
      row({ lineId: 'B', parentLineId: 'A', title: 'New Child B', quantity: 2, sortOrder: 1 }),
    ],
  })
  assert.ok(upload)

  await assert.rejects(
    acceptBomUpload({ projectId, uploadId: upload!.id, actorId: userId }),
    (error: unknown) => error instanceof BomDomainError && error.code === 'UNRECONCILED'
  )
  assert.equal(
    (await db.projectBomUpload.findUniqueOrThrow({ where: { id: upload!.id } })).status,
    ProjectBomUploadStatus.PENDING_RECONCILIATION
  )

  const parent = upload!.lines.find((line) => line.sourceLineKey === 'A')!
  const child = upload!.lines.find((line) => line.sourceLineKey === 'B')!
  await reconcileBomLine({
    projectId,
    uploadId: upload!.id,
    lineId: parent.id,
    actorId: userId,
    componentId: existingComponentId,
  })
  const reconciledChild = await reconcileBomLine({
    projectId,
    uploadId: upload!.id,
    lineId: child.id,
    actorId: userId,
    createComponent: { code: `CHILD-${suffix}`, unit: 'pcs' },
  })
  createdComponentIds.push(reconciledChild.componentId!)
  await acceptBomUpload({ projectId, uploadId: upload!.id, actorId: userId })

  const requirements = await getProjectComponentRequirements(projectId)
  assert.equal(requirements.find((item) => item.projectComponentId === parent.id)?.grossRequired.toString(), '10')
  assert.equal(requirements.find((item) => item.projectComponentId === child.id)?.grossRequired.toString(), '20')

  const replacement = await createBomUpload({
    projectId,
    fileName: 'replacement.xlsx',
    uploadedById: userId,
    rows: [row({ lineId: 'C', title: 'Replacement Root', quantity: 3 })],
  })
  assert.ok(replacement)
  assert.equal((await getProjectComponentRequirements(projectId)).length, 2, 'pending upload must not affect live requirements')

  const replacementLine = replacement!.lines[0]
  const reconciledReplacement = await reconcileBomLine({
    projectId,
    uploadId: replacement!.id,
    lineId: replacementLine.id,
    actorId: userId,
    createComponent: { code: `REPLACE-${suffix}` },
  })
  createdComponentIds.push(reconciledReplacement.componentId!)
  await acceptBomUpload({ projectId, uploadId: replacement!.id, actorId: userId })

  assert.equal(
    (await db.projectBomUpload.findUniqueOrThrow({ where: { id: upload!.id } })).status,
    ProjectBomUploadStatus.SUPERSEDED
  )
  const active = await getProjectComponentRequirements(projectId)
  assert.equal(active.length, 1)
  assert.equal(active[0].projectComponentId, replacementLine.id)
  assert.equal(active[0].grossRequired.toString(), '3')
})
