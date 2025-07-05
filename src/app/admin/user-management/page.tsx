
import { adminGetAllUsers } from "@/lib/actions";
import { columns } from "./columns";
import { DataTable } from "./data-table";

export default async function AdminUserManagementPage() {
    const users = await adminGetAllUsers();
    
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">User Management</h1>
                <p className="text-muted-foreground">View, manage, and take action on user accounts.</p>
            </div>
            <DataTable columns={columns} data={users} filterColumn="email" />
        </div>
    )
}
