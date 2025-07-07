
"use client"

import { ColumnDef } from "@tanstack/react-table"
import type { Transaction } from "@/lib/types"
import { format } from 'date-fns';
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ArrowUpDown, MoreHorizontal, RefreshCw, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { retryPayout } from "@/lib/actions";

const toDate = (timestamp: any): Date => {
    if (timestamp && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    return new Date(timestamp);
};

const getStatusBadgeVariant = (status: Transaction['status']) => {
    switch (status) {
        case 'success':
            return 'outline';
        case 'failed':
        case 'reversed':
            return 'destructive';
        case 'pending':
        default:
            return 'secondary';
    }
}

const ActionsCell = ({ row }: { row: { original: Transaction }}) => {
    const transaction = row.original;
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleRetry = async () => {
        setIsLoading(true);
        try {
            await retryPayout(transaction.id);
            toast({ title: "Payout Retried", description: "A new transfer has been initiated." });
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Retry Failed", description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    const canRetry = transaction.status === 'failed' || transaction.status === 'reversed';

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
                {canRetry && (
                     <DropdownMenuItem onClick={handleRetry} disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4" />} Retry Payout
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export const columns: ColumnDef<Transaction>[] = [
  {
    accessorKey: "createdAt",
    header: "Date",
    cell: ({ row }) => <div>{format(toDate(row.getValue("createdAt")), 'PPp')}</div>,
  },
  {
    accessorKey: "recipientName",
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Recipient <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
        <Link href={`/profile/${row.original.uid}`} className="hover:underline font-medium">
            {row.getValue("recipientName")}
        </Link>
    )
  },
  {
    accessorKey: "tournamentId",
    header: "Tournament",
    cell: ({ row }) => (
        <Link href={`/tournaments/${row.original.tournamentId}`} className="hover:underline text-xs text-muted-foreground">
            View
        </Link>
    )
  },
  {
    accessorKey: "category",
    header: "Category",
    cell: ({ row }) => <div className="capitalize">{row.getValue("category").toString().replace('_', ' ')}</div>,
  },
  {
    accessorKey: "amount",
    header: "Amount (NGN)",
    cell: ({ row }) => `₦${(row.getValue("amount") as number).toLocaleString()}`,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
        const status = row.getValue("status") as Transaction['status'];
        return <Badge variant={getStatusBadgeVariant(status)}>{status}</Badge>
    }
  },
  {
    id: "actions",
    cell: ActionsCell,
  },
];
