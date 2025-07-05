
import { getArticles } from "@/lib/actions";
import { columns } from "./columns";
import { DataTable } from "./data-table";

export default async function AdminCommunityPage() {
    const articles = await getArticles();
    
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Community Hub Management</h1>
                <p className="text-muted-foreground">Create, edit, and delete news and guides.</p>
            </div>
            <DataTable columns={columns} data={articles} filterColumn="title" />
        </div>
    )
}
