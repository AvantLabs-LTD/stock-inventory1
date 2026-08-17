import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

export interface ProjectComponentRequirement {
  projectComponentId: string
  projectId: string
  componentId: string | null
  parentProjectComponentId: string | null
  depth: number
  grossRequired: Prisma.Decimal
  allocatedQuantity: Prisma.Decimal
  issuedQuantity: Prisma.Decimal
  coveredQuantity: Prisma.Decimal
  uncoveredQuantity: Prisma.Decimal
  isBlocker: boolean
}

export async function getProjectComponentRequirements(projectId: string) {
  return db.$queryRaw<ProjectComponentRequirement[]>`
    SELECT
      "projectComponentId",
      "projectId",
      "componentId",
      "parentProjectComponentId",
      "depth",
      "grossRequired",
      "allocatedQuantity",
      "issuedQuantity",
      "coveredQuantity",
      "uncoveredQuantity",
      "isBlocker"
    FROM "project_component_requirements"
    WHERE "projectId" = ${projectId}
    ORDER BY "depth", "projectComponentId"
  `
}

export async function getProjectBlockers(projectId: string) {
  const requirements = await getProjectComponentRequirements(projectId)
  return requirements.filter((requirement) => requirement.isBlocker)
}
