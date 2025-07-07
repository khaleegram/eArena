

"use client"

import { ColumnDef } from "@tanstack/react-table"
import type { Tournament } from "@/lib/types"
import { format } from 'date-fns';
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ArrowUpDown, MoreHorizontal, ShieldCheck, Trash2, Coins } from "lucide-react"
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useTransition } from "react";
import { useToast } from "@/hooks/use-toast";
import { adminDeleteTournament, initiatePayouts } from "@/lib/actions";

const toDate = (timestamp: any): Date => {
    if (timestamp && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    return new Date(timestamp);
};

const ActionsCell = ({ row }: { row: { original: Tournament }}) => {
    const tournament = row.original;
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const handleDelete = () => {
        if (!confirm(`Are you sure you want to delete the tournament "${tournament.name}"? This is irreversible.`)) {
            return;
        }

        startTransition(async () => {
            try {
                await adminDeleteTournament(tournament.id);
                toast({ title: "Success", description: "Tournament has been deleted." });
            } catch (error: any) {
                toast({ variant: 'destructive', title: "Error", description: error.message });
            }
        });
    }
    
    const handlePayout = () => {
        if (!confirm(`This will initiate payouts for "${tournament.name}". This action cannot be undone. Continue?`)) {
            return;
        }

        startTransition(async () => {
            try {
                await initiatePayouts(tournament.id);
                toast({ title: "Payouts Initiated", description: "The payout process has started." });
            } catch (error: any) {
                toast({ variant: 'destructive', title: "Error", description: error.message });
            }
        });
    }

    const canInitiatePayout = tournament.status === 'completed' && tournament.rewardDetails.type === 'money' && !tournament.payoutInitiated;

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
                    <Link href={`/tournaments/${tournament.id}`}>View Tournament</Link>
                </DropdownMenuItem>
                {canInitiatePayout && (
                     <DropdownMenuItem onClick={handlePayout} disabled={isPending}>
                        <Coins className="mr-2 h-4 w-4" /> Initiate Payouts
                    </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} className="text-destructive" disabled={isPending}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete Tournament
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export const columns: ColumnDef<Tournament>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
        const status = row.getValue("status") as string;
        return <Badge variant="outline">{status.replace(/_/g, ' ')}</Badge>
    }
  },
  {
    accessorKey: "format",
    header: "Format",
    cell: ({ row }) => <div className="capitalize">{row.getValue("format")}</div>
  },
  {
    accessorKey: "teamCount",
    header: "Teams",
    cell: ({ row }) => {
        const tournament = row.original;
        return <div>{tournament.teamCount} / {tournament.maxTeams}</div>
    }
  },
  {
    accessorKey: "organizerUsername",
    header: "Organizer",
  },
    {
    accessorKey: "tournamentStartDate",
    header: "Start Date",
    cell: ({ row }) => {
      const date = row.getValue("tournamentStartDate")
      return <div>{format(toDate(date), 'PP')}</div>
    },
  },
  {
    id: "actions",
    cell: ActionsCell,
  },
]
