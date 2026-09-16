import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Flux ERP",
  description: "Flux enterprise workspace for Vault, Cargo, Orders, People and Ledger.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  )
}
