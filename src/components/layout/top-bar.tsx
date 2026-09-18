'use client'

import { KeyRound, LogOut, Moon, Sun, User } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'

interface TopBarProps {
  onChangePassword?: () => void
}

export function TopBar({ onChangePassword }: TopBarProps) {
  const { setTheme, theme } = useTheme()
  const { user, logout } = useAuthStore()
  const currentPage = useAppStore(state => state.currentPage)
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  if (!user) return null

  const initials = user.name.split(' ').map((name) => name[0]).join('').toUpperCase().slice(0, 2)

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <div className="flex-1 text-sm font-medium text-muted-foreground">
        {currentPage === 'flux' ? 'Flux ERP' : currentPage.startsWith('cargo') ? 'Flux · Cargo' : ['orders', 'people', 'ledger'].includes(currentPage) ? `Flux · ${currentPage[0].toUpperCase()}${currentPage.slice(1)}` : currentPage === 'users' ? 'Flux · Administration' : 'Flux · Vault'}
      </div>
      {mounted && (
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          <span className="sr-only">Toggle theme</span>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="size-8 rounded-full p-0">
            <Avatar className="size-8"><AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback></Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end">
          <DropdownMenuLabel>
            <div className="flex flex-col gap-1"><span>{user.name}</span><span className="text-xs font-normal text-muted-foreground">Authenticated user</span></div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem disabled><User className="mr-2 size-4" />{user.email}</DropdownMenuItem>
            <DropdownMenuItem onClick={onChangePassword}><KeyRound className="mr-2 size-4" />Change password</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void logout()}><LogOut className="mr-2 size-4" />Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
