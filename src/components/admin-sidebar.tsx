
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Users, Shield, Trophy, Newspaper, Settings, Banknote } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"

const menuItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/user-management", label: "User Management", icon: Users },
  { href: "/admin/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/admin/payouts", label: "Payouts", icon: Banknote },
  { href: "/admin/community", label: "Community", icon: Newspaper },
  { href: "/admin/settings", label: "Settings", icon: Settings },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar>
        <SidebarHeader>
            <div className="flex items-center gap-2">
                <Shield className="size-8 text-primary" />
                <div className="flex flex-col">
                    <h2 className="text-lg font-semibold tracking-tighter font-headline">Admin</h2>
                    <p className="text-xs text-muted-foreground">Control Panel</p>
                </div>
            </div>
        </SidebarHeader>
        <SidebarContent>
            <SidebarMenu>
            {menuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={pathname.startsWith(item.href) && item.href !== '/admin' || pathname === '/admin' && item.href === '/admin'} className="font-medium">
                      <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
            </SidebarMenu>
        </SidebarContent>
    </Sidebar>
  )
}
