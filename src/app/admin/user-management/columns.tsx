

"use client"

import { ColumnDef } from "@tanstack/react-table"
import type { UserProfile } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ArrowUpDown, MoreHorizontal, ShieldAlert, ShieldCheck } from "lucide-react"
import { ReputationAvatar } from "@/components/reputation-avatar"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { useTransition } from "react"
import { useToast } from "@/hooks/use-toast"
import { adminUpdateUser } from "@/lib/actions/admin"
import { AchievementIcons } from "@/components/achievement-icons"


const ActionsCell = ({ row }: { row: { original: UserProfile }}) => {
    const user = row.original;
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const handleToggleBan = () => {
        const action = user.isBanned ? "unbanning" : "banning";
        if (!confirm(`Are you sure you want to ${user.isBanned ? 'unban' : 'ban'} the user "${user.username}"?`)) {
            return;
        }

        startTransition(async () => {
            try {
                await adminUpdateUser(user.uid, { isBanned: !user.isBanned });
                toast({ title: "Success", description: `User has been ${user.isBanned ? 'unbanned' : 'banned'}.` });
            } catch (error: any) {
                toast({ variant: 'destructive', title: "Error", description: error.message });
            }
        });
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                    <Link href={`/profile/${user.uid}`}>View Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleToggleBan} className={user.isBanned ? "text-green-500" : "text-destructive"} disabled={isPending}>
                    {user.isBanned ? <ShieldCheck className="mr-2 h-4 w-4" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                    {user.isBanned ? 'Unban User' : 'Ban User'}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export const columns: ColumnDef<UserProfile>[] = [
  {
    accessorKey: "username",
    header: "User",
    cell: ({ row }) => {
        const user = row.original;
        return (
            <div className="flex items-center gap-2">
                <ReputationAvatar profile={user} />
                <div className="flex flex-col">
                    <span className="font-medium">{user.username}</span>
                    <div className="flex items-center gap-1.5">
                        {user.activeTitle && <Badge variant="outline" className="text-xs">{user.activeTitle}</Badge>}
                        <AchievementIcons profile={user} />
                    </div>
                </div>
            </div>
        )
    }
  },
  {
    accessorKey: "email",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Email
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
  },
  {
    accessorKey: "warnings",
    header: "Warnings",
    cell: ({ row }) => {
        const warnings = row.getValue("warnings") as number || 0;
        return <div>{warnings}</div>
    }
  },
  {
    accessorKey: "tournamentsWon",
    header: "Trophies",
    cell: ({ row }) => {
        return <div>{row.getValue("tournamentsWon") || 0}</div>
    }
  },
  {
    accessorKey: "isBanned",
    header: "Status",
    cell: ({ row }) => {
        const isBanned = row.getValue("isBanned");
        if (isBanned) {
            return <Badge variant="destructive">Banned</Badge>
        }
        return <Badge variant="secondary">Active</Badge>
    }
  },
  {
    id: "actions",
    cell: ActionsCell,
  },
]
