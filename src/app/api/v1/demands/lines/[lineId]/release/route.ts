import { NextRequest } from "next/server"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"
export async function POST(request: NextRequest, context: { params: Promise<{ lineId: string }> }) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  void request; void context
  return Response.json({ error: "Allocation release is now an approval revision rather than a separate reservation transaction.", code: "RELEASE_ENDPOINT_RETIRED" }, { status: 410 })
}
