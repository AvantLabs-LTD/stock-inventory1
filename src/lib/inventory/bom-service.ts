import { randomUUID } from 'node:crypto'
import {
  Prisma,
  ProjectBomUploadStatus,
  ProjectComponentReconciliationStatus,
} from '@prisma/client'
import { db } from '@/lib/db'
import type { BomImportRow } from '@/lib/inventory/bom-import'

export class BomDomainError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'INVALID_STATE' | 'UNRECONCILED' | 'INVALID_COMPONENT'
  ) {
    super(message)
    this.name = 'BomDomainError'
  }
}

export async function createBomUpload(input: {
  projectId: string
  fileName: string
  sheetName?: string
  uploadedById: string
  rows: BomImportRow[]
}) {
  return db.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: input.projectId }, select: { id: true } })
    if (!project) throw new BomDomainError('Project was not found', 'NOT_FOUND')

    const latestVersion = await tx.projectBomUpload.aggregate({
      where: { projectId: input.projectId },
      _max: { versionNumber: true },
    })

    const upload = await tx.projectBomUpload.create({
      data: {
        projectId: input.projectId,
        versionNumber: (latestVersion._max.versionNumber ?? 0) + 1,
        fileName: input.fileName,
        sheetName: input.sheetName,
        uploadedById: input.uploadedById,
      },
    })

    const remaining = [...input.rows]
    const associations = new Map<string, string>()
    while (remaining.length > 0) {
      const creatableIndex = remaining.findIndex(
        (row) => !row.parentLineId || associations.has(row.parentLineId)
      )
      if (creatableIndex === -1) {
        throw new BomDomainError('The BOM hierarchy cannot be resolved', 'INVALID_STATE')
      }
      const [row] = remaining.splice(creatableIndex, 1)
      const created = await tx.projectComponent.create({
        data: {
          projectId: input.projectId,
          bomUploadId: upload.id,
          parentProjectComponentId: row.parentLineId ? associations.get(row.parentLineId) : null,
          sourceLineKey: row.lineId,
          title: row.title,
          discipline: row.discipline,
          description: row.description,
          function: row.function,
          link: row.link,
          optionSelection: row.optionSelection,
          remarks: row.remarks,
          quantity: row.quantity,
          sortOrder: row.sortOrder,
        },
      })
      associations.set(row.lineId, created.id)
    }

    return tx.projectBomUpload.findUnique({
      where: { id: upload.id },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function reconcileBomLine(input: {
  projectId: string
  uploadId: string
  lineId: string
  actorId: string
  componentId?: string
  createComponent?: { code?: string; unit?: string }
}) {
  return db.$transaction(async (tx) => {
    const line = await tx.projectComponent.findFirst({
      where: { id: input.lineId, projectId: input.projectId, bomUploadId: input.uploadId },
      include: { bomUpload: { select: { status: true } } },
    })
    if (!line) throw new BomDomainError('BOM line was not found', 'NOT_FOUND')
    if (line.bomUpload?.status !== ProjectBomUploadStatus.PENDING_RECONCILIATION) {
      throw new BomDomainError('Only pending BOM uploads can be reconciled', 'INVALID_STATE')
    }
    if (Boolean(input.componentId) === Boolean(input.createComponent)) {
      throw new BomDomainError('Choose an existing component or create a new one', 'INVALID_COMPONENT')
    }

    let componentId = input.componentId
    if (componentId) {
      const component = await tx.component.findFirst({
        where: { id: componentId, status: { not: 'ARCHIVED' } },
        select: { id: true },
      })
      if (!component) throw new BomDomainError('Component was not found', 'INVALID_COMPONENT')
    } else {
      const component = await tx.component.create({
        data: {
          code: input.createComponent?.code?.trim().toUpperCase()
            || `CMP-${randomUUID().slice(0, 8).toUpperCase()}`,
          title: line.title,
          discipline: line.discipline,
          description: line.description,
          function: line.function,
          link: line.link,
          optionSelection: line.optionSelection,
          remarks: line.remarks,
          unit: input.createComponent?.unit?.trim() || 'pcs',
          createdById: input.actorId,
          balance: { create: {} },
        },
      })
      componentId = component.id
    }

    return tx.projectComponent.update({
      where: { id: line.id },
      data: {
        componentId,
        reconciliationStatus: ProjectComponentReconciliationStatus.RECONCILED,
        reconciledById: input.actorId,
        reconciledAt: new Date(),
      },
      include: { component: true },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function acceptBomUpload(input: {
  projectId: string
  uploadId: string
  actorId: string
}) {
  return db.$transaction(async (tx) => {
    const upload = await tx.projectBomUpload.findFirst({
      where: { id: input.uploadId, projectId: input.projectId },
      include: { lines: { select: { id: true, componentId: true, reconciliationStatus: true } } },
    })
    if (!upload) throw new BomDomainError('BOM upload was not found', 'NOT_FOUND')
    if (upload.status !== ProjectBomUploadStatus.PENDING_RECONCILIATION) {
      throw new BomDomainError('Only pending BOM uploads can be accepted', 'INVALID_STATE')
    }
    const unreconciled = upload.lines.filter(
      (line) => !line.componentId || line.reconciliationStatus !== ProjectComponentReconciliationStatus.RECONCILED
    )
    if (unreconciled.length > 0) {
      throw new BomDomainError(`${unreconciled.length} BOM line(s) are not reconciled`, 'UNRECONCILED')
    }

    await tx.projectBomUpload.updateMany({
      where: {
        projectId: input.projectId,
        status: ProjectBomUploadStatus.ACCEPTED,
        id: { not: upload.id },
      },
      data: { status: ProjectBomUploadStatus.SUPERSEDED },
    })
    return tx.projectBomUpload.update({
      where: { id: upload.id },
      data: {
        status: ProjectBomUploadStatus.ACCEPTED,
        acceptedById: input.actorId,
        acceptedAt: new Date(),
      },
      include: { lines: { orderBy: { sortOrder: 'asc' }, include: { component: true } } },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
