
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import type { UserProfile, BankDetails } from '@/lib/types';
import { getNigerianBanks, saveUserBankDetails } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const bankDetailsSchema = z.object({
  bankCode: z.string().min(1, 'Please select a bank.'),
  accountNumber: z.string().length(10, 'Account number must be 10 digits.'),
});

type BankDetailsFormValues = z.infer<typeof bankDetailsSchema>;

interface Bank {
  name: string;
  code: string;
}

export function BankDetailsForm({ userProfile }: { userProfile: UserProfile }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = React.useState(false);
    const [isVerifying, setIsVerifying] = React.useState(false);
    const [banks, setBanks] = React.useState<Bank[]>([]);
    const [verifiedAccountName, setVerifiedAccountName] = React.useState<string | null>(userProfile.bankDetails?.accountName || null);

    const form = useForm<BankDetailsFormValues>({
        resolver: zodResolver(bankDetailsSchema),
        defaultValues: {
            bankCode: userProfile.bankDetails?.bankCode || '',
            accountNumber: userProfile.bankDetails?.accountNumber || '',
        }
    });

    React.useEffect(() => {
        const fetchBanks = async () => {
            try {
                const bankList = await getNigerianBanks();
                setBanks(bankList);
            } catch (error) {
                toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch bank list.' });
            }
        };
        fetchBanks();
    }, [toast]);
    
    const onSubmit = async (data: BankDetailsFormValues) => {
        if (!user) return;
        setIsLoading(true);
        try {
            const selectedBank = banks.find(b => b.code === data.bankCode);
            if (!selectedBank) throw new Error("Invalid bank selected.");

            const result = await saveUserBankDetails(user.uid, {
                bankCode: data.bankCode,
                bankName: selectedBank.name,
                accountNumber: data.accountNumber,
            });
            
            setVerifiedAccountName(result.accountName);
            toast({ title: 'Bank Details Saved!', description: `Account verified for: ${result.accountName}` });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsLoading(false);
        }
    };
    
    // Watch form fields to trigger re-verification if they change
    const watchedAccountNumber = form.watch('accountNumber');
    const watchedBankCode = form.watch('bankCode');

    React.useEffect(() => {
        // If the user changes their details, clear the verified name to prompt re-verification
        if(watchedAccountNumber !== userProfile.bankDetails?.accountNumber || watchedBankCode !== userProfile.bankDetails?.bankCode) {
            setVerifiedAccountName(null);
        } else {
            setVerifiedAccountName(userProfile.bankDetails?.accountName || null);
        }
    }, [watchedAccountNumber, watchedBankCode, userProfile.bankDetails]);


    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                    <FormField
                        control={form.control}
                        name="bankCode"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Bank Name</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select your bank..." />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {banks.map(bank => (
                                            <SelectItem key={bank.code} value={bank.code}>{bank.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="accountNumber"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Account Number</FormLabel>
                                <FormControl><Input placeholder="0123456789" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                {verifiedAccountName && (
                    <Card className="bg-green-950/50 border-green-500/30">
                        <CardContent className="pt-6">
                            <p className="text-sm font-semibold text-green-400">Verified Account Name: <span className="text-white">{verifiedAccountName}</span></p>
                        </CardContent>
                    </Card>
                )}
                <Button type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {verifiedAccountName ? 'Update Details' : 'Verify & Save Account'}
                </Button>
            </form>
        </Form>
    );
}
