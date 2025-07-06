
"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Trophy, PlusCircle, UserCircle, LogOut, MessageSquare } from "lucide-react"
import { signOut } from "firebase/auth"

import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar"
import { auth } from "@/lib/firebase"

const menuItems = [
  { href: "/dashboard", label: "My Tournaments", icon: Trophy },
  { href: "/dashboard/create-tournament", label: "Create Tournament", icon: PlusCircle },
  { href: "/profile", label: "Profile", icon: UserCircle },
  { href: "/messages", label: "Messages", icon: MessageSquare },
]

export function DashboardSidebar() {
  const pathname = usePathname()
  const router = useRouter();
  const { user } = useAuth()

  const onSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };
  
  if (!user) return null

  return (
    <Sidebar>
        <SidebarHeader>
            <div className="flex items-center gap-2">
                <Trophy className="size-8 text-primary" />
                <div className="flex flex-col">
                    <h2 className="text-lg font-semibold tracking-tighter font-headline">eArena</h2>
                    <p className="text-xs text-muted-foreground">Organizer Dashboard</p>
                </div>
            </div>
        </SidebarHeader>
        <SidebarContent>
            <SidebarMenu>
            {menuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={pathname.startsWith(item.href) && item.href !== '/dashboard' || pathname === item.href} className="font-medium">
                      <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
            </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
            <Button variant="ghost" className="w-full justify-start gap-2" onClick={onSignOut}>
                <LogOut className="size-4" />
                <span>Logout</span>
            </Button>
        </SidebarFooter>
    </Sidebar>
  )
}
