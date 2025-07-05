
import { adminGetAllTournaments } from "@/lib/actions";
import { columns } from "./columns";
import { DataTable } from "./data-table";

export default async function AdminTournamentsPage() {
    const tournaments = await adminGetAllTournaments();
    
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Tournament Management</h1>
                <p className="text-muted-foreground">Oversee and manage all tournaments on the platform.</p>
            </div>
            <DataTable columns={columns} data={tournaments} filterColumn="name" />
        </div>
    )
}
