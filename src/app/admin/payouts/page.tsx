
import { adminGetAllTransactions } from "@/lib/actions";
import { columns } from "./columns";
import { DataTable } from "./data-table";

export default async function AdminPayoutsPage() {
    const transactions = await adminGetAllTransactions();
    
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Payout Management</h1>
                <p className="text-muted-foreground">Monitor and manage all tournament prize payouts.</p>
            </div>
            <DataTable columns={columns} data={transactions} filterColumn="recipientName" />
        </div>
    )
}
