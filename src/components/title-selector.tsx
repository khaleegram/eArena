

'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import { updateUserActiveTitle } from '@/lib/actions';
import { Loader2, Crown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

export function TitleSelector() {
    const { user, userProfile } = useAuth();
    const [selectedTitle, setSelectedTitle] = useState(userProfile?.activeTitle || 'none');
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    if (!user || !userProfile?.playerTitles || userProfile.playerTitles.length === 0) {
        return null;
    }

    const handleSave = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            await updateUserActiveTitle(user.uid, selectedTitle === 'none' ? null : selectedTitle);
            toast({ title: "Success", description: "Your active title has been updated." });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update title.' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline text-xl flex items-center gap-2"><Crown /> Select Your Title</CardTitle>
                <CardDescription>Choose a title to display on your profile.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Select value={selectedTitle} onValueChange={setSelectedTitle}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a title..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">-- No Title --</SelectItem>
                        {userProfile.playerTitles.map(title => (
                            <SelectItem key={title.title} value={title.title}>{title.title}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button onClick={handleSave} disabled={isLoading || selectedTitle === (userProfile.activeTitle || 'none')}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Set Active Title
                </Button>
            </CardContent>
        </Card>
    );
}
