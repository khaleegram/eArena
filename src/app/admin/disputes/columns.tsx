
"use client"

import { ColumnDef } from "@tanstack/react-table"
import type { DisputedMatchInfo } from "@/lib/types"
import { format } from 'date-fns';
import { Button } from "@/components/ui/button"
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Swords, AlertTriangle, History } from "lucide-react";

const toDate = (timestamp: any): Date => {
    if (timestamp && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    return new Date(timestamp);
};

const getStatusBadge = (status: string, replayRequestStatus?: string) => {
    if (replayRequestStatus === 'pending' || replayRequestStatus === 'accepted') {
        return <Badge variant="outline" className="border-cyan-500 text-cyan-500"><History className="mr-1 h-3 w-3"/>Replay Requested</Badge>
    }
    switch (status) {
        case 'disputed':
            return <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3"/>Disputed</Badge>
        case 'needs_secondary_evidence':
            return <Badge variant="outline" className="border-yellow-500 text-yellow-500"><AlertTriangle className="mr-1 h-3 w-3"/>Needs Evidence</Badge>
        default:
            return <Badge variant="secondary">{status}</Badge>
    }
}

export const columns: ColumnDef<DisputedMatchInfo>[] = [
  {
    accessorKey: "tournamentName",
    header: "Tournament",
     cell: ({ row }) => (
        <Link href={`/tournaments/${row.original.tournamentId}`} className="hover:underline font-medium">
            {row.original.tournamentName}
        </Link>
    )
  },
  {
    accessorKey: "teams",
    header: "Match",
    cell: ({ row }) => {
        const match = row.original;
        return (
            <div className="flex items-center gap-2 text-sm">
                <span>{match.homeTeam.name}</span>
                <Swords className="h-4 w-4 text-muted-foreground" />
                <span>{match.awayTeam.name}</span>
            </div>
        )
    }
  },
  {
    accessorKey: "round",
    header: "Round",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
        const match = row.original;
        return getStatusBadge(match.status, match.replayRequest?.status);
    }
  },
  {
    accessorKey: "matchDay",
    header: "Match Day",
    cell: ({ row }) => <div>{format(toDate(row.getValue("matchDay")), 'PP')}</div>,
  },
  {
    id: "actions",
    cell: ({ row }) => (
        <Button asChild variant="ghost" size="sm">
            <Link href={`/tournaments/${row.original.tournamentId}?tab=schedule`}>
                Resolve <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
        </Button>
    )
  },
]
