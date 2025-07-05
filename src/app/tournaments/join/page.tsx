

"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { findTournamentByCode } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2, KeyRound } from 'lucide-react';
import Link from 'next/link';

export default function JoinTournamentPage() {
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code.trim()) {
            toast({ variant: 'destructive', title: 'Error', description: 'Please enter a tournament code.' });
            return;
        }
        setIsLoading(true);
        try {
            const tournamentId = await findTournamentByCode(code.trim());
            if (tournamentId) {
                router.push(`/tournaments/${tournamentId}`);
            } else {
                toast({ variant: 'destructive', title: 'Not Found', description: 'No tournament found with that code. Please check the code and try again.' });
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'An error occurred while searching for the tournament.' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container flex items-center justify-center py-24">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="font-headline text-3xl">Join a Tournament</CardTitle>
                    <CardDescription>
                        Enter the unique code provided by the organizer.
                        <br/>
                        Don't have a code? <Link href="/tournaments" className="underline hover:text-primary">Browse public tournaments</Link>.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="code">Tournament Code</Label>
                            <Input
                                id="code"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                placeholder="e.g., A1B2C3"
                                autoCapitalize="characters"
                                className="font-mono tracking-widest text-lg h-12 text-center"
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <KeyRound className="mr-2 h-4 w-4" />
                            )}
                            Find Tournament
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
