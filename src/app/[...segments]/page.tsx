import { AppShell } from "@/components/layout/app-shell"
import { getSession } from "@/lib/auth-middleware"

export default async function FluxRoute() {
  const session = await getSession()
  return <AppShell initialUser={session?.user ?? null} />
}
