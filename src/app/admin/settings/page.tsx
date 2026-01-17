
import { SettingsForm } from './settings-form';
import { getPlatformSettings } from '@/lib/settings';

export default async function AdminSettingsPage() {
    const settings = await getPlatformSettings();

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Platform Settings</h1>
                <p className="text-muted-foreground">Manage global settings for the entire application.</p>
            </div>
            <SettingsForm settings={settings} />
        </div>
    )
}
