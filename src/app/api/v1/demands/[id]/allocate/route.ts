import { NextRequest } from "next/server"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  void request; void context
  return Response.json({ error: "Allocation is now derived from approved stock fulfilment. Use the demand issue endpoint to hand over stock.", code: "ALLOCATION_ENDPOINT_RETIRED" }, { status: 410 })
}
