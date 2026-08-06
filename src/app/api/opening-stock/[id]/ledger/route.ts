import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// ─── GET /api/opening-stock/:id/ledger — Stock ledger entries ──────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view stock ledger')
    }

    const { id } = await params

    // Verify opening stock exists
    const stock = await db.openingStock.findUnique({
      where: { id },
      select: { id: true, productId: true },
    })

    if (!stock) {
      return Response.json({ error: 'Opening stock entry not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const [entries, total] = await Promise.all([
      db.stockLedger.findMany({
        where: { openingStockId: id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      db.stockLedger.count({ where: { openingStockId: id } }),
    ])

    return Response.json({
      data: entries.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('GET /api/opening-stock/:id/ledger error:', error)
    return Response.json({ error: 'Failed to fetch stock ledger' }, { status: 500 })
  }
}
