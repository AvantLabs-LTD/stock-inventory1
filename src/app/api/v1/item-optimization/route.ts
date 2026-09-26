import { NextRequest } from "next/server"
import { z } from "zod"
import { getSession, hasPermission, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-middleware"
import { alternativeOccurrences, previewMerge, commitMerge, previewStandardization, commitStandardization, optimizationError, mergeSchema } from "@/lib/item-optimization-service"

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "manufacturing.view")) return forbiddenResponse()
  try {
    const groupId = z.string().min(1).max(100).parse(request.nextUrl.searchParams.get("groupId"))
    const page = z.coerce.number().int().min(1).max(100000).parse(request.nextUrl.searchParams.get("page") || 1)
    const rows = await alternativeOccurrences(groupId, page)
    return Response.json({ occurrences: rows.slice(0, 500), hasMore: rows.length > 500 })
  } catch (error) { return optimizationError(error) }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  try {
    const body = z.object({ action: z.enum(["merge.preview", "merge.commit", "standardize.preview", "standardize.commit"]), input: z.unknown(), token: z.string().length(64).optional() }).strict().parse(await request.json())
    const merge = body.action.startsWith("merge"), commit = body.action.endsWith("commit")
    if (!hasPermission(session, merge ? "vault.catalogue.manage" : "manufacturing.definitions.manage")) return forbiddenResponse()
    if (merge) {
      const input = mergeSchema.parse(body.input)
      if (input.moveBalance && !hasPermission(session, "vault.stock.adjust")) return forbiddenResponse()
      if (input.moveOpenDemand && !hasPermission(session, "vault.demands.manage")) return forbiddenResponse()
      if (input.moveOpenPurchases && !hasPermission(session, "vault.purchasing.manage")) return forbiddenResponse()
      if (input.moveBomLines && !hasPermission(session, "manufacturing.definitions.manage")) return forbiddenResponse()
    }
    const actor = { id: session.user.id, name: session.credential.type === "service_token" ? `${session.user.name} (API: ${session.credential.name})` : session.user.name }
    if (!commit) return Response.json(merge ? await previewMerge(body.input) : await previewStandardization(body.input))
    const token = z.string().length(64).parse(body.token), key = request.headers.get("idempotency-key") || ""
    return Response.json(merge ? await commitMerge(body.input, token, actor, key) : await commitStandardization(body.input, token, actor, key))
  } catch (error) { return optimizationError(error) }
}
