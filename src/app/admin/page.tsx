
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Shield, Trophy, Newspaper, Settings, BarChart3, Banknote } from "lucide-react";
import Link from 'next/link';
import { getAdminDashboardAnalytics } from "@/lib/actions";
import { StatCard } from "@/components/admin/analytics/stat-card";

export default async function AdminDashboardPage() {
    const analytics = await getAdminDashboardAnalytics();

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Admin Dashboard</h1>
                <p className="text-muted-foreground">Welcome to the eArena control center.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <StatCard title="Total Users" value={analytics.totalUsers.toString()} icon={<Users />} />
                <StatCard title="Active Tournaments" value={analytics.activeTournaments.toString()} icon={<Trophy />} />
                <StatCard title="Platform Fees (NGN)" value={`₦${analytics.totalPlatformFees.toLocaleString()}`} icon={<Banknote />} />
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Link href="/admin/analytics">
                    <Card className="hover:border-primary/50 transition-colors">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><BarChart3 /> Analytics</CardTitle>
                            <CardDescription>View user growth and platform statistics.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Monitor the health and growth of your platform.</p>
                        </CardContent>
                    </Card>
                </Link>
                <Link href="/admin/user-management">
                    <Card className="hover:border-primary/50 transition-colors">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Users /> User Management</CardTitle>
                            <CardDescription>View, edit, and manage user profiles.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Take actions like banning or unbanning users.</p>
                        </CardContent>
                    </Card>
                </Link>
                 <Link href="/admin/tournaments">
                    <Card className="hover:border-primary/50 transition-colors">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Trophy /> Tournament Oversight</CardTitle>
                            <CardDescription>Monitor and intervene in ongoing tournaments.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">View all tournaments and delete if necessary.</p>
                        </CardContent>
                    </Card>
                </Link>
                <Link href="/admin/community">
                    <Card className="hover:border-primary/50 transition-colors">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Newspaper /> Community Hub</CardTitle>
                            <CardDescription>Manage articles, news, and guides.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Create, edit, and delete community content.</p>
                        </CardContent>
                    </Card>
                </Link>
                <Link href="/admin/settings">
                    <Card className="hover:border-primary/50 transition-colors">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Settings /> Platform Settings</CardTitle>
                            <CardDescription>Manage site-wide settings.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Control features like maintenance mode.</p>
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    )
}
