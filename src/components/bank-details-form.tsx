

'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import type { UserProfile } from '@/lib/types';
import { getNigerianBanks, verifyBankAccount, saveUserBankDetails, confirmUserDetailsForPayout } from '@/lib/actions';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ShieldCheck } from 'lucide-react';
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
    const [isSaving, setIsSaving] = React.useState(false);
    const [isVerifying, setIsVerifying] = React.useState(false);
    const [isConfirming, setIsConfirming] = React.useState(false);
    const [banks, setBanks] = React.useState<Bank[]>([]);
    const [verifiedAccountName, setVerifiedAccountName] = React.useState<string | null>(userProfile.bankDetails?.accountName || null);

    const isConfirmed = userProfile.bankDetails?.confirmedForPayout;

    const form = useForm<BankDetailsFormValues>({
        resolver: zodResolver(bankDetailsSchema),
        defaultValues: {
            bankCode: userProfile.bankDetails?.bankCode || '',
            accountNumber: userProfile.bankDetails?.accountNumber || '',
        },
        mode: 'onChange'
    });

    React.useEffect(() => {
        const fetchBanks = async () => {
            try {
                const bankList = await getNigerianBanks();
                setBanks(bankList);
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'Error', description: error.message || 'Could not fetch bank list.' });
            }
        };
        fetchBanks();
    }, [toast]);
    
    // Watch form fields to trigger re-verification if they change
    const watchedAccountNumber = form.watch('accountNumber');
    const watchedBankCode = form.watch('bankCode');

    React.useEffect(() => {
        const hasFormChanged = watchedAccountNumber !== userProfile.bankDetails?.accountNumber || watchedBankCode !== userProfile.bankDetails?.bankCode;
        if(hasFormChanged) {
            setVerifiedAccountName(null);
        } else {
             setVerifiedAccountName(userProfile.bankDetails?.accountName || null);
        }
    }, [watchedAccountNumber, watchedBankCode, userProfile.bankDetails]);

    const handleVerify = async () => {
        const { accountNumber, bankCode } = form.getValues();
        if (!accountNumber || !bankCode) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please select a bank and enter an account number.'});
            return;
        }
        if (accountNumber.length !== 10) {
            form.setError("accountNumber", { type: "manual", message: "Account number must be 10 digits." });
            return;
        }

        setIsVerifying(true);
        setVerifiedAccountName(null);
        try {
            const result = await verifyBankAccount(accountNumber, bankCode);
            setVerifiedAccountName(result.account_name);
            toast({ title: 'Account Verified!', description: `Name: ${result.account_name}` });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Verification Failed', description: error.message });
        } finally {
            setIsVerifying(false);
        }
    };
    
    const onSave = async () => {
        if (!user || !verifiedAccountName) return;
        const { accountNumber, bankCode } = form.getValues();

        setIsSaving(true);
        try {
            await saveUserBankDetails(user.uid, { bankCode, accountNumber });
            toast({ title: 'Success!', description: 'Your bank details have been saved.' });
            form.reset({ accountNumber, bankCode }); // Resets the dirty state
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsSaving(false);
        }
    };
    
    const onConfirmForPayout = async () => {
        if (!user) return;
        setIsConfirming(true);
        try {
            await confirmUserDetailsForPayout(user.uid);
            toast({ title: 'Details Confirmed!', description: 'Your account is ready for payouts.'});
        } catch (error: any) {
             toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsConfirming(false);
        }
    };

    const hasChanged = form.formState.isDirty && (watchedAccountNumber !== userProfile.bankDetails?.accountNumber || watchedBankCode !== userProfile.bankDetails?.bankCode);

    return (
        <div className="space-y-6">
            <Form {...form}>
                <div className="grid md:grid-cols-2 gap-6">
                    <FormField
                        control={form.control}
                        name="bankCode"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Bank Name</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isVerifying || isSaving || isConfirmed}>
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
                                <FormControl><Input placeholder="0123456789" {...field} disabled={isVerifying || isSaving || isConfirmed} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            </Form>

            {hasChanged && (
                <Button onClick={handleVerify} disabled={isVerifying || form.formState.isSubmitting || !!form.formState.errors.accountNumber} className="w-full">
                    {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify Account
                </Button>
            )}

            {verifiedAccountName && (
                 <Card className="bg-green-950/50 border-green-500/30 mt-4">
                    <CardContent className="pt-6">
                        <p className="text-sm font-semibold text-green-400">Verified Account Name: <span className="text-white">{verifiedAccountName}</span></p>
                    </CardContent>
                </Card>
            )}

            <Button onClick={onSave} disabled={isSaving || !verifiedAccountName || hasChanged || isConfirmed} className="w-full mt-4">
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Details
            </Button>
            
            {userProfile.bankDetails && !isConfirmed && (
                <Card className="border-primary/50">
                    <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
                        <ShieldCheck className="h-8 w-8 text-primary"/>
                        <p className="text-sm text-muted-foreground">Your saved details are ready. Confirm them to enable automated prize payouts for future wins.</p>
                        <Button onClick={onConfirmForPayout} disabled={isConfirming || hasChanged} className="w-full">
                            {isConfirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm for Payouts
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
