"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Tournament } from "@/lib/types";
import { FileText, ClipboardCopy, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const RuleItem = ({ label, value }: { label: string; value: string | number | boolean }) => {
    const displayValue = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value;
    return (
        <li className="flex justify-between items-center py-2 border-b">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold">{displayValue}</span>
        </li>
    );
};

export function OverviewTab({ tournament }: { tournament: Tournament }) {
    const { toast } = useToast();
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(tournament.code);
        setCopied(true);
        toast({ title: "Copied!", description: "Tournament code copied to clipboard." });
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-8">
                 <Card>
                    <CardHeader>
                        <CardTitle className="font-headline flex items-center gap-2"><Info className="w-5 h-5"/> Tournament Info</CardTitle>
                        <CardDescription>Key details and unique code for this tournament.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            Share this code with players to allow them to join this tournament if it's private.
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="font-mono text-lg font-bold tracking-widest bg-muted text-accent-foreground px-3 py-1 rounded-md">{tournament.code}</span>
                            <Button variant="outline" size="sm" onClick={handleCopy}>
                                {copied ? <Check className="w-4 h-4 text-green-500" /> : <ClipboardCopy className="w-4 h-4" />}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline flex items-center gap-2"><FileText className="w-5 h-5"/> General Rules</CardTitle>
                        <CardDescription>Code of conduct and other general information.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {tournament.rules ? (
                            <ScrollArea className="h-48 w-full rounded-md border p-4">
                                <pre className="whitespace-pre-wrap text-sm">{tournament.rules}</pre>
                            </ScrollArea>
                        ) : (
                            <p className="text-muted-foreground">The organizer has not specified any general rules.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Match Rules</CardTitle>
                    <CardDescription>Specific settings for every match played.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-1">
                        <RuleItem label="Match Length" value={`${tournament.matchLength} min`} />
                        <RuleItem label="Substitutions" value={tournament.substitutions} />
                        <RuleItem label="Home & Away Legs" value={tournament.homeAndAway} />
                        <RuleItem label="Extra Time" value={tournament.extraTime} />
                        <RuleItem label="Penalties" value={tournament.penalties} />
                        <RuleItem label="Injuries" value={tournament.injuries} />
                    </ul>
                    <div className="mt-4">
                        <h4 className="font-semibold text-sm mb-2">Squad Restrictions</h4>
                        <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
                            {tournament.squadRestrictions || "None specified."}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
