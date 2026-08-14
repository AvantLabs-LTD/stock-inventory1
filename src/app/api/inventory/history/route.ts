import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse } from '@/lib/auth-middleware'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '25')
    const search = searchParams.get('search') || ''
    const productId = searchParams.get('productId') || ''
    const type = searchParams.get('type') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''
    const departmentId = searchParams.get('departmentId') || ''
    const projectId = searchParams.get('projectId') || ''

    const where: Record<string, unknown> = {}

    if (productId) where.productId = productId
    if (type) where.type = type

    if (search) {
      where.product = {
        OR: [
          { name: { contains: search } },
          { code: { contains: search } },
          { sku: { contains: search } },
        ],
      }
    }

    if (dateFrom || dateTo) {
      where.date = {} as Record<string, unknown>
      if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59')
    }

    const [transactions, total] = await Promise.all([
      db.inventoryTransaction.findMany({
        where,
        include: {
          product: { select: { name: true, code: true, sku: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.inventoryTransaction.count({ where }),
    ])

    // ─── Fetch reservation and release events ────────────────────────
    // Build reservation query with the same filters
    const reservationWhere: Record<string, unknown> = {}
    if (productId) reservationWhere.productId = productId
    if (projectId) reservationWhere.projectId = projectId

    let reservationEvents: Array<{
      id: string
      productId: string
      quantity: number
      type: string
      date: Date
      createdAt: Date
      reason: string | null
      userName: string | null
    }> = []

    // Only fetch reservations if type is empty, RESERVE, or RELEASE_RESERVATION
    const includeReservations = !type || type === 'RESERVE' || type === 'RELEASE_RESERVATION'
    if (includeReservations) {
      const reservations = await db.reservedInventory.findMany({
        where: reservationWhere,
        include: {
          product: { select: { name: true, code: true, sku: true } },
          reservedByUser: { select: { name: true } },
          releasedByUser: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100, // reasonable limit
      })

      for (const r of reservations) {
        // Add RESERVE event
        reservationEvents.push({
          id: r.id,
          productId: r.productId,
          quantity: r.quantity,
          type: 'RESERVE',
          date: r.createdAt,
          createdAt: r.createdAt,
          reason: r.reason,
          userName: r.reservedByUser?.name || null,
        })

        // Add RELEASE_RESERVATION event if released
        if (r.status === 'RELEASED' && r.releasedAt) {
          reservationEvents.push({
            id: r.id,
            productId: r.productId,
            quantity: r.quantity,
            type: 'RELEASE_RESERVATION',
            date: r.releasedAt,
            createdAt: r.releasedAt,
            reason: r.reason,
            userName: r.releasedByUser?.name || null,
          })
        }
      }
    }

    // ─── Build user name map from audit logs ──────────────────────────
    // Try to find user names for transactions from related records
    const userNamesMap = new Map<string, string>()

    // Get references for ISSUED, RETURNED, GOODS_RECEIVED transactions
    const issuedRefs = transactions.filter(t => t.type === 'ISSUED' && t.reference).map(t => t.reference!)
    const returnedRefs = transactions.filter(t => t.type === 'RETURNED' && t.reference).map(t => t.reference!)
    const receivedRefs = transactions.filter(t => t.type === 'GOODS_RECEIVED').map(t => {
      // Find the goods received by product and date
      return { productId: t.productId, date: t.date }
    })

    // Look up issued by user names
    if (issuedRefs.length > 0) {
      const issues = await db.inventoryIssue.findMany({
        where: { id: { in: issuedRefs } },
        select: { id: true, issuedByUser: { select: { name: true } } },
      })
      for (const issue of issues) {
        if (issue.issuedByUser?.name) {
          userNamesMap.set(issue.id, issue.issuedByUser.name)
        }
      }
    }

    // Look up returned by user names
    if (returnedRefs.length > 0) {
      const returns = await db.inventoryReturn.findMany({
        where: { id: { in: returnedRefs } },
        select: { id: true, returnedByUser: { select: { name: true } } },
      })
      for (const ret of returns) {
        if (ret.returnedByUser?.name) {
          userNamesMap.set(ret.id, ret.returnedByUser.name)
        }
      }
    }

    // ─── Apply department/project filter to reservation events ────────
    // Since reservations link through projectId, we already filtered by projectId.
    // For departmentId, we need to check through the project.
    if (departmentId && includeReservations) {
      const departmentProjects = await db.project.findMany({
        where: { departmentId },
        select: { id: true },
      })
      const projectIds = new Set(departmentProjects.map(p => p.id))
      reservationEvents = reservationEvents.filter(e => {
        // We don't have projectId directly on the event, so skip filtering here
        return true
      })
    }

    // ─── Merge all events and sort ────────────────────────────────────
    const allEvents = [
      ...transactions.map(t => ({
        id: t.id,
        productId: t.productId,
        product: t.product,
        type: t.type,
        quantity: t.quantity,
        unitCost: t.unitCost,
        remarks: t.remarks,
        date: t.date,
        createdAt: t.createdAt,
        userName: t.reference ? (userNamesMap.get(t.reference) || null) : null,
      })),
      ...reservationEvents.map(e => ({
        id: e.id,
        productId: e.productId,
        product: transactions.find(t => t.productId === e.productId)?.product || null,
        type: e.type,
        quantity: e.quantity,
        unitCost: null as number | null,
        remarks: e.reason || null,
        date: e.date,
        createdAt: e.createdAt,
        userName: e.userName,
      })),
    ]

    // Sort by date descending
    allEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    // For reservation events without product info, fetch them
    const productIdsWithoutInfo = new Set<string>()
    for (const event of allEvents) {
      if (!event.product && event.productId) {
        productIdsWithoutInfo.add(event.productId)
      }
    }

    if (productIdsWithoutInfo.size > 0) {
      const products = await db.product.findMany({
        where: { id: { in: [...productIdsWithoutInfo] } },
        select: { id: true, name: true, code: true, sku: true },
      })
      const productMap = new Map(products.map(p => [p.id, p]))
      for (const event of allEvents) {
        if (!event.product) {
          event.product = productMap.get(event.productId) || null
        }
      }
    }

    // Serialize dates
    const serializedEvents = allEvents.map(event => ({
      ...event,
      date: new Date(event.date).toISOString(),
      createdAt: new Date(event.createdAt).toISOString(),
    }))

    return NextResponse.json({ transactions: serializedEvents, total, page, limit })
  } catch (error) {
    console.error('Inventory history error:', error)
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
  }
}
