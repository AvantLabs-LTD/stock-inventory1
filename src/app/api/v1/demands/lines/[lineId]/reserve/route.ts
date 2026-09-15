import { NextRequest } from "next/server"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"
export async function POST(request: NextRequest, context: { params: Promise<{ lineId: string }> }) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  void request; void context
  return Response.json({ error: "Reservations are now derived from demand approval. Approve the stock fulfilment quantity instead.", code: "RESERVATION_ENDPOINT_RETIRED" }, { status: 410 })
}
