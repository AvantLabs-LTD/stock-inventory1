'use client'

import {
  BarChart3,
  Package,
  ScrollText,
  PackageCheck,
  ArrowUpFromLine,
  Building2,
  FolderKanban,
  Lock,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { useAppStore } from '@/stores/app-store'

export type ReportType =
  | 'inventory-summary'
  | 'inventory-ledger'
  | 'goods-received'
  | 'goods-issued'
  | 'department-usage'
  | 'project-usage'
  | 'reserved-inventory'
  | 'low-stock'

interface ReportCard {
  type: ReportType
  title: string
  description: string
  icon: React.ElementType
  color: string
  bgColor: string
}

const reports: ReportCard[] = [
  {
    type: 'inventory-summary',
    title: 'Inventory Summary',
    description: 'Overview of all products with stock levels, values, and status',
    icon: Package,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
  },
  {
    type: 'inventory-ledger',
    title: 'Inventory Ledger',
    description: 'All transactions grouped by product with running balance',
    icon: ScrollText,
    color: 'text-sky-600',
    bgColor: 'bg-sky-50 dark:bg-sky-950/30',
  },
  {
    type: 'goods-received',
    title: 'Goods Received',
    description: 'All incoming goods with supplier and cost information',
    icon: PackageCheck,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50 dark:bg-teal-950/30',
  },
  {
    type: 'goods-issued',
    title: 'Goods Issued',
    description: 'All issued items with department and project details',
    icon: ArrowUpFromLine,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
  },
  {
    type: 'department-usage',
    title: 'Department Usage',
    description: 'Aggregated material usage and returns per department',
    icon: Building2,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50 dark:bg-violet-950/30',
  },
  {
    type: 'project-usage',
    title: 'Project Usage',
    description: 'Aggregated material consumption and reservations per project',
    icon: FolderKanban,
    color: 'text-pink-600',
    bgColor: 'bg-pink-50 dark:bg-pink-950/30',
  },
  {
    type: 'reserved-inventory',
    title: 'Reserved Inventory',
    description: 'All active stock reservations with product and project info',
    icon: Lock,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
  },
  {
    type: 'low-stock',
    title: 'Low Stock Alert',
    description: 'Products below minimum stock level, sorted by severity',
    icon: AlertTriangle,
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
  },
]

export function ReportsPage() {
  const navigate = useAppStore((s) => s.navigate)

  function handleOpenReport(type: ReportType) {
    navigate('report-view', type)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Generate and export inventory reports"
        icon={BarChart3}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {reports.map((report) => (
          <Card
            key={report.type}
            className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30 group"
            onClick={() => handleOpenReport(report.type)}
          >
            <CardContent className="p-5">
              <div className={`inline-flex items-center justify-center size-10 rounded-xl ${report.bgColor} mb-4 group-hover:scale-110 transition-transform`}>
                <report.icon className={`size-5 ${report.color}`} />
              </div>
              <h3 className="font-semibold text-sm mb-1">{report.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {report.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
