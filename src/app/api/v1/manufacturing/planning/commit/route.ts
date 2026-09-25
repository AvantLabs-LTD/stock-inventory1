import { NextRequest } from "next/server"
import { getSession,hasPermission,forbiddenResponse,unauthorizedResponse } from "@/lib/auth-middleware"
import { commitPlanningChanges,manufacturingDefinitionApiError } from "@/lib/manufacturing-definitions-service"
import { normalizeIdempotencyKey } from "@/lib/idempotency"

export async function POST(request:NextRequest){
  const session=await getSession(request);if(!session)return unauthorizedResponse()
  if(!hasPermission(session,"manufacturing.definitions.manage"))return forbiddenResponse()
  try{const key=normalizeIdempotencyKey(request.headers.get("idempotency-key"));if(!key)return Response.json({code:"KEY_REQUIRED",error:"An idempotency key is required"},{status:400});return Response.json(await commitPlanningChanges(await request.json(),{id:session.user.id,name:session.user.name},key),{status:201})}catch(error){return manufacturingDefinitionApiError(error)}
}
