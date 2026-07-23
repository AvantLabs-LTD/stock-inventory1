import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

function escapeCsv(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsvRow(row: Record<string, unknown>, headers: string[]): string {
  return headers.map((h) => escapeCsv(row[h])).join(',')
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
}

// GET /api/reports/export/excel?reportType=xxx&categoryId=xxx&...filters...
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'reports', 'view')) {
      return forbiddenResponse('No permission to export reports')
    }

    const { searchParams } = new URL(request.url)
    const reportType = searchParams.get('reportType') || 'inventory-summary'

    let csvContent = ''
    let filename = `${reportType.replace(/_/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`

    const categoryId = searchParams.get('categoryId')
    const status = searchParams.get('status')
    const departmentId = searchParams.get('departmentId')
    const projectId = searchParams.get('projectId')
    const supplierId = searchParams.get('supplierId')
    const productId = searchParams.get('productId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    switch (reportType) {
      case 'inventory-summary': {
        const productFilter: Record<string, unknown> = {}
        if (categoryId) productFilter.categoryId = categoryId
        if (status) productFilter.status = status

        const products = await db.product.findMany({
          where: Object.keys(productFilter).length > 0 ? productFilter : undefined,
          select: {
            id: true, code: true, name: true, sku: true, unit: true, minimumStock: true, unitCost: true, status: true,
            category: { select: { name: true } },
            supplier: { select: { name: true } },
          },
        })

        const productIds = products.map((p) => p.id)
        const transactions = await db.inventoryTransaction.findMany({
          where: productIds.length > 0 ? { productId: { in: productIds } } : undefined,
          select: { productId: true, type: true, quantity: true },
        })
        const reservations = await db.reservedInventory.groupBy({
          by: ['productId'], where: { status: 'ACTIVE' }, _sum: { quantity: true },
        })
        const reservedMap = new Map(reservations.map((r) => [r.productId, r._sum.quantity || 0]))
        const txMap = new Map<string, { opening: number; received: number; issued: number; returned: number; adjIn: number; adjOut: number }>()
        for (const p of products) txMap.set(p.id, { opening: 0, received: 0, issued: 0, returned: 0, adjIn: 0, adjOut: 0 })
        for (const tx of transactions) {
          const e = txMap.get(tx.productId)
          if (!e) continue
          switch (tx.type) {
            case 'OPENING_STOCK': e.opening += tx.quantity; break
            case 'GOODS_RECEIVED': e.received += tx.quantity; break
            case 'ISSUED': e.issued += tx.quantity; break
            case 'RETURNED': e.returned += tx.quantity; break
            case 'ADJUSTMENT_IN': e.adjIn += tx.quantity; break
            case 'ADJUSTMENT_OUT': e.adjOut += tx.quantity; break
          }
        }

        const headers = ['Product Code', 'Product Name', 'SKU', 'Category', 'Supplier', 'Unit', 'Status', 'Opening Stock', 'Received', 'Issued', 'Returned', 'Reserved', 'Available', 'Unit Cost', 'Total Value']
        const rows = products.map((p) => {
          const tx = txMap.get(p.id)!
          const reserved = reservedMap.get(p.id) || 0
          const available = tx.opening + tx.received + tx.returned + tx.adjIn - tx.issued - tx.adjOut - reserved
          return {
            'Product Code': p.code,
            'Product Name': p.name,
            'SKU': p.sku,
            'Category': p.category?.name ?? '',
            'Supplier': p.supplier?.name ?? '',
            'Unit': p.unit,
            'Status': p.status,
            'Opening Stock': tx.opening,
            'Received': tx.received,
            'Issued': tx.issued,
            'Returned': tx.returned,
            'Reserved': reserved,
            'Available': Math.max(0, available),
            'Unit Cost': p.unitCost,
            'Total Value': formatCurrency(Math.max(0, available) * (p.unitCost || 0)),
          }
        })
        csvContent = [headers.join(','), ...rows.map((r) => toCsvRow(r, headers))].join('\n')
        break
      }

      case 'inventory-ledger': {
        const txFilter: Record<string, unknown> = {}
        if (productId) txFilter.productId = productId
        if (dateFrom || dateTo) {
          txFilter.date = {}
          if (dateFrom) (txFilter.date as Record<string, unknown>).gte = new Date(dateFrom)
          if (dateTo) (txFilter.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59.999Z')
        }
        const txns = await db.inventoryTransaction.findMany({
          where: Object.keys(txFilter).length > 0 ? txFilter : undefined,
          orderBy: [{ productId: 'asc' }, { date: 'asc' }],
          include: { product: { select: { name: true, code: true, unit: true } } },
        })
        const headers = ['Product Code', 'Product Name', 'Date', 'Type', 'Quantity In', 'Quantity Out', 'Unit Cost', 'Reference', 'Remarks']
        let runningBalance = 0
        const rows = txns.map((tx) => {
          let qtyIn = 0, qtyOut = 0
          switch (tx.type) {
            case 'OPENING_STOCK': case 'GOODS_RECEIVED': case 'RETURNED': case 'ADJUSTMENT_IN':
              qtyIn = tx.quantity; runningBalance += tx.quantity; break
            case 'ISSUED': case 'ADJUSTMENT_OUT':
              qtyOut = tx.quantity; runningBalance -= tx.quantity; break
          }
          return {
            'Product Code': tx.product.code,
            'Product Name': tx.product.name,
            'Date': formatDate(tx.date),
            'Type': tx.type.replace(/_/g, ' '),
            'Quantity In': qtyIn || '',
            'Quantity Out': qtyOut || '',
            'Unit Cost': tx.unitCost ? formatCurrency(tx.unitCost) : '',
            'Reference': tx.reference ?? '',
            'Remarks': tx.remarks ?? '',
          }
        })
        csvContent = [headers.join(','), ...rows.map((r) => toCsvRow(r, headers))].join('\n')
        break
      }

      case 'goods-received': {
        const filter: Record<string, unknown> = {}
        if (supplierId) filter.supplierId = supplierId
        if (dateFrom || dateTo) {
          filter.date = {}
          if (dateFrom) (filter.date as Record<string, unknown>).gte = new Date(dateFrom)
          if (dateTo) (filter.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59.999Z')
        }
        const records = await db.goodsReceived.findMany({
          where: Object.keys(filter).length > 0 ? filter : undefined,
          orderBy: { date: 'desc' },
          include: {
            product: { select: { name: true, code: true, unit: true } },
            supplier: { select: { name: true } },
            receivedByUser: { select: { name: true } },
          },
        })
        const headers = ['Date', 'Product', 'Supplier', 'Invoice #', 'Source', 'Quantity', 'Unit', 'Unit Cost', 'Total Cost', 'Received By', 'Remarks']
        const rows = records.map((r) => ({
          'Date': formatDate(r.date),
          'Product': `${r.product.name} (${r.product.code})`,
          'Supplier': r.supplier?.name ?? '',
          'Invoice #': r.invoiceNumber ?? '',
          'Source': r.source ?? '',
          'Quantity': r.quantity,
          'Unit': r.product.unit,
          'Unit Cost': formatCurrency(r.unitCost),
          'Total Cost': formatCurrency(r.quantity * r.unitCost),
          'Received By': r.receivedByUser.name,
          'Remarks': r.remarks ?? '',
        }))
        csvContent = [headers.join(','), ...rows.map((r) => toCsvRow(r, headers))].join('\n')
        break
      }

      case 'goods-issued': {
        const filter: Record<string, unknown> = {}
        if (departmentId) filter.departmentId = departmentId
        if (projectId) filter.projectId = projectId
        if (dateFrom || dateTo) {
          filter.date = {}
          if (dateFrom) (filter.date as Record<string, unknown>).gte = new Date(dateFrom)
          if (dateTo) (filter.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59.999Z')
        }
        const records = await db.inventoryIssue.findMany({
          where: Object.keys(filter).length > 0 ? filter : undefined,
          orderBy: { date: 'desc' },
          include: {
            product: { select: { name: true, code: true, unit: true } },
            department: { select: { name: true } },
            project: { select: { name: true } },
            issuedByUser: { select: { name: true } },
          },
        })
        const headers = ['Date', 'Product', 'Department', 'Project', 'Employee', 'Quantity', 'Unit', 'Issued By', 'Remarks']
        const rows = records.map((r) => ({
          'Date': formatDate(r.date),
          'Product': `${r.product.name} (${r.product.code})`,
          'Department': r.department.name,
          'Project': r.project.name,
          'Employee': r.employeeName,
          'Quantity': r.quantity,
          'Unit': r.product.unit,
          'Issued By': r.issuedByUser.name,
          'Remarks': r.remarks ?? '',
        }))
        csvContent = [headers.join(','), ...rows.map((r) => toCsvRow(r, headers))].join('\n')
        break
      }

      case 'department-usage': {
        const issueFilter: Record<string, unknown> = {}
        const returnFilter: Record<string, unknown> = {}
        if (dateFrom || dateTo) {
          issueFilter.date = {}
          returnFilter.date = {}
          if (dateFrom) { (issueFilter.date as Record<string, unknown>).gte = new Date(dateFrom); (returnFilter.date as Record<string, unknown>).gte = new Date(dateFrom) }
          if (dateTo) { (issueFilter.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59.999Z'); (returnFilter.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59.999Z') }
        }
        const departments = await db.department.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } })
        const issuedAgg = await db.inventoryIssue.groupBy({ by: ['departmentId'], where: Object.keys(issueFilter).length > 0 ? issueFilter : undefined, _sum: { quantity: true }, _count: { id: true } })
        const returnAgg = await db.inventoryReturn.groupBy({ by: ['departmentId'], where: Object.keys(returnFilter).length > 0 ? returnFilter : undefined, _sum: { quantity: true }, _count: { id: true } })
        const issuedMap = new Map(issuedAgg.map((a) => [a.departmentId, { total: a._sum.quantity || 0, count: a._count.id }]))
        const returnMap = new Map(returnAgg.map((a) => [a.departmentId, { total: a._sum.quantity || 0, count: a._count.id }]))
        const headers = ['Department Code', 'Department Name', 'Total Issued', 'Issue Count', 'Total Returned', 'Return Count', 'Net Usage']
        const rows = departments.map((d) => {
          const issued = issuedMap.get(d.id) || { total: 0, count: 0 }
          const ret = returnMap.get(d.id) || { total: 0, count: 0 }
          return {
            'Department Code': d.code,
            'Department Name': d.name,
            'Total Issued': issued.total,
            'Issue Count': issued.count,
            'Total Returned': ret.total,
            'Return Count': ret.count,
            'Net Usage': issued.total - ret.total,
          }
        }).filter((r) => r['Total Issued'] > 0 || r['Total Returned'] > 0)
        csvContent = [headers.join(','), ...rows.map((r) => toCsvRow(r, headers))].join('\n')
        break
      }

      case 'project-usage': {
        const projects = await db.project.findMany({
          where: departmentId ? { departmentId } : undefined,
          select: { id: true, name: true, code: true, status: true, department: { select: { name: true } } },
          orderBy: { name: 'asc' },
        })
        const projectIds = projects.map((p) => p.id)
        const issueFilter: Record<string, unknown> = projectIds.length > 0 ? { projectId: { in: projectIds } } : {}
        const issuedAgg = await db.inventoryIssue.groupBy({ by: ['projectId'], where: Object.keys(issueFilter).length > 0 ? issueFilter : undefined, _sum: { quantity: true }, _count: { id: true } })
        const returnAgg = await db.inventoryReturn.groupBy({ by: ['projectId'], where: projectIds.length > 0 ? { projectId: { in: projectIds } } : undefined, _sum: { quantity: true }, _count: { id: true } })
        const resAgg = await db.reservedInventory.groupBy({ by: ['projectId'], where: projectIds.length > 0 ? { projectId: { in: projectIds }, status: 'ACTIVE' } : { status: 'ACTIVE' }, _sum: { quantity: true }, _count: { id: true } })
        const issuedMap = new Map(issuedAgg.map((a) => [a.projectId, { total: a._sum.quantity || 0, count: a._count.id }]))
        const returnMap = new Map(returnAgg.map((a) => [a.projectId, { total: a._sum.quantity || 0, count: a._count.id }]))
        const resMap = new Map(resAgg.map((a) => [a.projectId, { total: a._sum.quantity || 0, count: a._count.id }]))
        const headers = ['Project Code', 'Project Name', 'Department', 'Status', 'Total Issued', 'Issue Count', 'Total Returned', 'Return Count', 'Reserved', 'Reservation Count', 'Net Usage']
        const rows = projects.map((p) => {
          const issued = issuedMap.get(p.id) || { total: 0, count: 0 }
          const ret = returnMap.get(p.id) || { total: 0, count: 0 }
          const res = resMap.get(p.id) || { total: 0, count: 0 }
          return {
            'Project Code': p.code,
            'Project Name': p.name,
            'Department': p.department?.name ?? '',
            'Status': p.status,
            'Total Issued': issued.total,
            'Issue Count': issued.count,
            'Total Returned': ret.total,
            'Return Count': ret.count,
            'Reserved': res.total,
            'Reservation Count': res.count,
            'Net Usage': issued.total - ret.total,
          }
        }).filter((r) => r['Total Issued'] > 0 || r['Total Returned'] > 0 || r['Reserved'] > 0)
        csvContent = [headers.join(','), ...rows.map((r) => toCsvRow(r, headers))].join('\n')
        break
      }

      case 'reserved-inventory': {
        const records = await db.reservedInventory.findMany({
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          include: {
            product: { select: { name: true, code: true, unit: true } },
            project: { select: { name: true, code: true, department: { select: { name: true } } } },
            reservedByUser: { select: { name: true } },
          },
        })
        const headers = ['Product', 'Product Code', 'Project', 'Department', 'Quantity', 'Unit', 'Reason', 'Reserved By', 'Reserved Date']
        const rows = records.map((r) => ({
          'Product': r.product.name,
          'Product Code': r.product.code,
          'Project': r.project.name,
          'Department': r.project.department.name,
          'Quantity': r.quantity,
          'Unit': r.product.unit,
          'Reason': r.reason ?? '',
          'Reserved By': r.reservedByUser.name,
          'Reserved Date': formatDate(r.createdAt),
        }))
        csvContent = [headers.join(','), ...rows.map((r) => toCsvRow(r, headers))].join('\n')
        break
      }

      case 'low-stock': {
        const products = await db.product.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true, code: true, name: true, sku: true, unit: true, minimumStock: true, unitCost: true, category: { select: { name: true } }, supplier: { select: { name: true } } },
        })
        const pids = products.map((p) => p.id)
        const txns = await db.inventoryTransaction.findMany({ where: pids.length > 0 ? { productId: { in: pids } } : undefined, select: { productId: true, type: true, quantity: true } })
        const resvs = await db.reservedInventory.groupBy({ by: ['productId'], where: { status: 'ACTIVE' }, _sum: { quantity: true } })
        const resMap = new Map(resvs.map((r) => [r.productId, r._sum.quantity || 0]))
        const txM = new Map<string, { o: number; r: number; i: number; ret: number; ai: number; ao: number }>()
        for (const p of products) txM.set(p.id, { o: 0, r: 0, i: 0, ret: 0, ai: 0, ao: 0 })
        for (const tx of txns) {
          const e = txM.get(tx.productId)
          if (!e) continue
          switch (tx.type) {
            case 'OPENING_STOCK': e.o += tx.quantity; break
            case 'GOODS_RECEIVED': e.r += tx.quantity; break
            case 'ISSUED': e.i += tx.quantity; break
            case 'RETURNED': e.ret += tx.quantity; break
            case 'ADJUSTMENT_IN': e.ai += tx.quantity; break
            case 'ADJUSTMENT_OUT': e.ao += tx.quantity; break
          }
        }
        const headers = ['Product Code', 'Product Name', 'SKU', 'Category', 'Supplier', 'Unit', 'Minimum Stock', 'Available', 'Deficit', 'Unit Cost', 'Status']
        const rows = products.map((p) => {
          const t = txM.get(p.id)!
          const res = resMap.get(p.id) || 0
          const avail = t.o + t.r + t.ret + t.ai - t.i - t.ao - res
          return {
            'Product Code': p.code,
            'Product Name': p.name,
            'SKU': p.sku,
            'Category': p.category?.name ?? '',
            'Supplier': p.supplier?.name ?? '',
            'Unit': p.unit,
            'Minimum Stock': p.minimumStock,
            'Available': Math.max(0, avail),
            'Deficit': Math.max(0, p.minimumStock - Math.max(0, avail)),
            'Unit Cost': formatCurrency(p.unitCost),
            'Status': avail <= 0 ? 'Out of Stock' : 'Low Stock',
          }
        }).filter((r) => r['Available'] <= r['Minimum Stock'])
        csvContent = [headers.join(','), ...rows.map((r) => toCsvRow(r, headers))].join('\n')
        break
      }

      default:
        return Response.json({ error: 'Unknown report type' }, { status: 400 })
    }

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('GET /api/reports/export/excel error:', error)
    return Response.json({ error: 'Failed to export report' }, { status: 500 })
  }
}
