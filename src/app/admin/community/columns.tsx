
"use client"

import { ColumnDef } from "@tanstack/react-table"
import type { Article } from "@/lib/types"
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
import { ArrowUpDown, MoreHorizontal, Trash2, Edit } from "lucide-react"
import { useTransition } from "react";
import { useToast } from "@/hooks/use-toast";
import { adminDeleteArticle } from "@/lib/actions/admin";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

const toDate = (timestamp: any): Date => {
    if (timestamp && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    return new Date(timestamp);
};

const ActionsCell = ({ row }: { row: { original: Article }}) => {
    const article = row.original;
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const handleDelete = () => {
        if (!confirm(`Are you sure you want to delete the article "${article.title}"? This is irreversible.`)) {
            return;
        }

        startTransition(async () => {
            try {
                await adminDeleteArticle(article.slug);
                toast({ title: "Success", description: "Article has been deleted." });
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
                    <Link href={`/community/articles/${article.slug}`} target="_blank">View Article</Link>
                </DropdownMenuItem>
                 <DropdownMenuItem asChild>
                    <Link href={`/admin/community/edit/${article.slug}`} className="flex items-center"><Edit className="mr-2 h-4 w-4"/>Edit</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} className="text-destructive" disabled={isPending}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete Article
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export const columns: ColumnDef<Article>[] = [
  {
    accessorKey: "title",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Title
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => <Badge variant="outline" className="capitalize">{row.getValue("type")}</Badge>
  },
    {
    accessorKey: "authorName",
    header: "Author",
  },
    {
    accessorKey: "createdAt",
    header: "Published On",
    cell: ({ row }) => {
      const date = row.getValue("createdAt")
      return <div>{format(toDate(date), 'PP')}</div>
    },
  },
  {
    id: "actions",
    cell: ActionsCell,
  },
]
