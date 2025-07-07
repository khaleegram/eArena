
'use client';

import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';
import { savePrizeAllocation } from '@/lib/actions';
import type { Tournament, PrizeAllocation } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, Percent, Coins } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const prizeAllocationSchema = z.object({
  first_place: z.coerce.number().min(0).max(100),
  second_place: z.coerce.number().min(0).max(100),
  third_place: z.coerce.number().min(0).max(100),
  best_overall: z.coerce.number().min(0).max(100),
  highest_scoring: z.coerce.number().min(0).max(100),
  best_defensive: z.coerce.number().min(0).max(100),
  best_attacking: z.coerce.number().min(0).max(100),
}).refine(data => {
    const total = Object.values(data).reduce((sum, val) => sum + val, 0);
    return total === 95;
}, {
    message: "The total allocation must equal 95%. The remaining 5% is the platform fee.",
    path: ['first_place'], // Assign error to a field
});

const DEFAULT_ALLOCATION: PrizeAllocation = {
    first_place: 35,
    second_place: 20,
    third_place: 15,
    best_overall: 10,
    highest_scoring: 5,
    best_defensive: 5,
    best_attacking: 5,
};

export function PrizeAllocationEditor({ tournament }: { tournament: Tournament }) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  
  const form = useForm<z.infer<typeof prizeAllocationSchema>>({
    resolver: zodResolver(prizeAllocationSchema),
    defaultValues: tournament.rewardDetails.prizeAllocation || DEFAULT_ALLOCATION,
    mode: 'onChange',
  });

  const watchedValues = useWatch({ control: form.control });
  const totalPercentage = React.useMemo(() => {
      return Object.values(watchedValues).reduce((sum, val) => sum + (Number(val) || 0), 0);
  }, [watchedValues]);
  
  const onSubmit = async (values: z.infer<typeof prizeAllocationSchema>) => {
    setIsLoading(true);
    try {
      await savePrizeAllocation(tournament.id, values);
      toast({ title: 'Success!', description: 'Prize allocation has been updated.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const restoreDefaults = () => {
      form.reset(DEFAULT_ALLOCATION);
      toast({title: "Defaults Restored", description: "The prize allocation has been reset to the default values."});
  }

  if (tournament.rewardDetails.type !== 'money') return null;
  if(tournament.payoutInitiated) {
      return (
        <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Coins />Prize Allocation</CardTitle></CardHeader>
            <CardContent>
                <p className="text-muted-foreground">The prize structure is locked because the payout process has already begun.</p>
            </CardContent>
        </Card>
      )
  }

  return (
    <Card>
        <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><Coins />Customize Prize Allocation</CardTitle>
            <CardDescription>Define how the prize pool is distributed among winners. The total must be exactly 95%.</CardDescription>
        </CardHeader>
        <CardContent>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                     <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <FormField control={form.control} name="first_place" render={({ field }) => <FormItem><FormLabel>🥇 1st Place</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage/></FormItem>} />
                        <FormField control={form.control} name="second_place" render={({ field }) => <FormItem><FormLabel>🥈 2nd Place</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage/></FormItem>} />
                        <FormField control={form.control} name="third_place" render={({ field }) => <FormItem><FormLabel>🥉 3rd Place</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage/></FormItem>} />
                        <FormField control={form.control} name="best_overall" render={({ field }) => <FormItem><FormLabel>👑 Best Overall Team</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage/></FormItem>} />
                        <FormField control={form.control} name="highest_scoring" render={({ field }) => <FormItem><FormLabel>⚽ Highest Scoring Team</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage/></FormItem>} />
                        <FormField control={form.control} name="best_defensive" render={({ field }) => <FormItem><FormLabel>🛡️ Best Defensive Team</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage/></FormItem>} />
                        <FormField control={form.control} name="best_attacking" render={({ field }) => <FormItem><FormLabel>🚀 Best Attacking Team</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage/></FormItem>} />
                     </div>
                     <Separator />
                      <div className="p-4 rounded-lg bg-muted flex items-center justify-between">
                        <div className="font-semibold text-lg flex items-center gap-2"><Percent/>Total Allocation</div>
                        <div className="text-right">
                            <p className={`font-bold text-2xl ${totalPercentage === 95 ? 'text-green-400' : 'text-destructive'}`}>{totalPercentage}% / 95%</p>
                            <p className="text-xs text-muted-foreground">Platform Fee: 5%</p>
                        </div>
                      </div>
                      {form.formState.errors.first_place && (
                        <p className="text-sm font-medium text-destructive">{form.formState.errors.first_place.message}</p>
                      )}
                    <div className="flex justify-between items-center">
                        <Button type="button" variant="outline" onClick={restoreDefaults}>Restore Defaults</Button>
                        <Button type="submit" disabled={isLoading || totalPercentage !== 95}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            Save Allocation
                        </Button>
                    </div>
                </form>
            </Form>
        </CardContent>
    </Card>
  );
}
