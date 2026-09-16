import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"

export async function GET(request: NextRequest) {
  const session = await getSession(request); if (!session) return unauthorizedResponse(); if (!hasPermission(session, "vault.demands.view")) return forbiddenResponse()
  const itemId = request.nextUrl.searchParams.get("itemId") || undefined
  const query = request.nextUrl.searchParams.get("q")?.trim()
  const rows = await db.$queryRaw<Array<Record<string, Prisma.Decimal | string | Date | null>>>(Prisma.sql`
    SELECT dl."id" "demandLineId",dl."itemId",dl.title,dl.unit,d."id" "demandId",d."demandNo",d."requestedAt",
      d.state,d."departmentTagId",dt.name "departmentName",pt.name "projectName",u.name "requestedByName",
      i.code "itemCode",i.title "itemTitle",i.specification,
      q.required,q.reserved,q.allocated,q.remaining,q.backlog,q."pendingApproval",q.ordered,q.shipped,
      COALESCE(s."physicalDeficit",0) "physicalDeficit",COALESCE(s."unprocuredDeficit",0) "unprocuredDeficit"
    FROM "demand_lines" dl
    JOIN "demands" d ON d.id=dl."demandId"
    JOIN "User" u ON u.id=d."requestedById"
    JOIN "items" i ON i.id=dl."itemId"
    JOIN "demand_line_quantities" q ON q."demandLineId"=dl.id
    LEFT JOIN "demand_line_supply" s ON s."demandLineId"=dl.id
    LEFT JOIN "department_tags" dt ON dt.id=d."departmentTagId"
    LEFT JOIN "project_tags" pt ON pt.id=dl."projectTagId"
    WHERE d.state IN ('SUBMITTED','ACTIVE')
      AND q.remaining > 0
      ${itemId ? Prisma.sql`AND dl."itemId"=${itemId}` : Prisma.empty}
      ${query ? Prisma.sql`AND (d."demandNo" ILIKE ${`%${query}%`} OR dl.title ILIKE ${`%${query}%`} OR i.code ILIKE ${`%${query}%`} OR i.title ILIKE ${`%${query}%`} OR dt.name ILIKE ${`%${query}%`} OR pt.name ILIKE ${`%${query}%`})` : Prisma.empty}
    ORDER BY (COALESCE(s."unprocuredDeficit",0) > 0) DESC,d."requestedAt",dl."sortOrder"
    LIMIT 300
  `)
  return Response.json({ lines: rows })
}
