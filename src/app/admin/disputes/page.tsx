
import { adminGetAllDisputedMatches } from "@/lib/actions";
import { columns } from "./columns";
import { DataTable } from "./data-table";

export default async function AdminDisputesPage() {
    const disputedMatches = await adminGetAllDisputedMatches();
    
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Dispute Center</h1>
                <p className="text-muted-foreground">Review and resolve all disputed matches across the platform.</p>
            </div>
            <DataTable columns={columns} data={disputedMatches} filterColumn="tournamentName" />
        </div>
    )
}
