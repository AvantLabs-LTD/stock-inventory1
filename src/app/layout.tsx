import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Store Portal",
  description: "Demand, inventory and purchasing visibility in one operational system.",
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
