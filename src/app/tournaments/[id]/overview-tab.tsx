"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Tournament, UnifiedTimestamp } from "@/lib/types";
import { FileText, ClipboardCopy, Check, Info, Crown, Globe, Lock, Gamepad2, Users, Trophy, Calendar, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { toDate } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    const [copiedCode, setCopiedCode] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);

    const handleCopyCode = () => {
        if (!tournament.code) return;
        navigator.clipboard.writeText(tournament.code);
        setCopiedCode(true);
        toast({ title: "Copied!", description: "Tournament code copied to clipboard." });
        setTimeout(() => setCopiedCode(false), 2000);
    };

    const handleCopyLink = () => {
        if (typeof window === 'undefined') return;
        const url = window.location.href.split('?')[0];
        navigator.clipboard.writeText(url);
        setCopiedLink(true);
        toast({ title: "Copied!", description: "Tournament link copied to clipboard." });
        setTimeout(() => setCopiedLink(false), 2000);
    };

    return (
        <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-8">
                 <Card>
                    <CardHeader>
                        <CardTitle className="font-headline flex items-center gap-2"><Trophy className="w-5 h-5"/> At a Glance</CardTitle>
                        <CardDescription>Key details about the tournament structure and schedule.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-3 text-sm">
                            <li className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-2"><Crown className="h-4 w-4" />Organizer</span> <strong className="text-right">{tournament.organizerUsername}</strong></li>
                            <li className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-2">{tournament.isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}Access</span> <strong className="text-right">{tournament.isPublic ? 'Public' : 'Private'}</strong></li>
                            <li className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-2"><Gamepad2 className="h-4 w-4" />Game</span> <strong className="text-right">{tournament.game} on {tournament.platform}</strong></li>
                            <li className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-2"><Trophy className="h-4 w-4" />Format</span> <strong className="text-right capitalize">{tournament.format?.replace('-', ' ')}</strong></li>
                            <li className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4" />Teams</span> <strong className="text-right">{tournament.teamCount} / {tournament.maxTeams}</strong></li>
                            <li className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-2"><Calendar className="h-4 w-4" />Registration</span> <strong className="text-right">{format(toDate(tournament.registrationStartDate), 'PP')} - {format(toDate(tournament.registrationEndDate), 'PP')}</strong></li>
                            <li className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-2"><Calendar className="h-4 w-4" />Play Period</span> <strong className="text-right">{format(toDate(tournament.tournamentStartDate), 'PP')} - {format(toDate(tournament.tournamentEndDate), 'PP')}</strong></li>
                        </ul>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle className="font-headline flex items-center gap-2"><Info className="w-5 h-5"/> Share Tournament</CardTitle>
                        <CardDescription>Share with others using a direct link or the unique code.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="join-code" className="text-xs font-semibold">Join Code (for private tournaments)</Label>
                            <div className="flex items-center gap-2 mt-1">
                                <Input id="join-code" readOnly value={tournament.code} className="font-mono tracking-widest text-lg h-10 text-center bg-muted" />
                                <Button variant="outline" size="icon" onClick={handleCopyCode} className="h-10 w-10">
                                    <span className="sr-only">Copy Code</span>
                                    {copiedCode ? <Check className="w-4 h-4 text-green-500" /> : <ClipboardCopy className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="share-link" className="text-xs font-semibold">Shareable Link</Label>
                            <div className="flex items-center gap-2 mt-1">
                                <Input id="share-link" readOnly value={typeof window !== 'undefined' ? window.location.href.split('?')[0] : ''} className="bg-muted"/>
                                <Button variant="outline" size="icon" onClick={handleCopyLink} className="h-10 w-10">
                                    <span className="sr-only">Copy Link</span>
                                    {copiedLink ? <Check className="w-4 h-4 text-green-500" /> : <Share2 className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
            <div className="space-y-8">
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
        </div>
    )
}
