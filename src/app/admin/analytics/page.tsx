
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminDashboardAnalytics } from "@/lib/actions";
import { UserGrowthChart } from "@/components/admin/analytics/user-growth-chart";
import { TournamentActivityChart } from "@/components/admin/analytics/tournament-activity-chart";
import { StatCard } from "@/components/admin/analytics/stat-card";
import { Users, Trophy, Banknote } from "lucide-react";

export default async function AnalyticsPage() {
    const analytics = await getAdminDashboardAnalytics();

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Analytics Dashboard</h1>
                <p className="text-muted-foreground">An overview of your platform's performance.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                 <StatCard title="Total Users" value={analytics.totalUsers.toString()} icon={<Users />} />
                 <StatCard title="Active Tournaments" value={analytics.activeTournaments.toString()} icon={<Trophy />} />
                 <StatCard title="Platform Fees (NGN)" value={`₦${analytics.totalPlatformFees.toLocaleString()}`} icon={<Banknote />} />
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>User Growth (Last 30 Days)</CardTitle>
                        <CardDescription>New users registered on the platform.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <UserGrowthChart data={analytics.userGrowth} />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Tournament Creation (Last 6 Months)</CardTitle>
                        <CardDescription>Number of new tournaments created each month.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <TournamentActivityChart data={analytics.tournamentActivity} />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
