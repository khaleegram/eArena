
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';
import { updatePlatformSettings } from '@/lib/actions';
import type { PlatformSettings } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription, FormMessage } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';

const urlSchema = z.string().url({ message: "Please enter a valid URL." }).or(z.literal(''));

const settingsSchema = z.object({
  isMaintenanceMode: z.boolean().default(false),
  allowNewTournaments: z.boolean().default(true),
  whatsappUrl: urlSchema,
  facebookUrl: urlSchema,
  instagramUrl: urlSchema,
  youtubeUrl: urlSchema,
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

interface SettingsFormProps {
    settings: PlatformSettings;
}

export function SettingsForm({ settings }: SettingsFormProps) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = React.useState(false);

    const form = useForm<SettingsFormValues>({
        resolver: zodResolver(settingsSchema),
        defaultValues: {
            isMaintenanceMode: settings.isMaintenanceMode || false,
            allowNewTournaments: settings.allowNewTournaments !== false, // default to true if undefined
            whatsappUrl: settings.whatsappUrl || '',
            facebookUrl: settings.facebookUrl || '',
            instagramUrl: settings.instagramUrl || '',
            youtubeUrl: settings.youtubeUrl || '',
        }
    });

    const onSubmit = async (values: SettingsFormValues) => {
        setIsLoading(true);
        try {
            await updatePlatformSettings(values);
            toast({ title: "Success!", description: "Platform settings have been updated." });
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Error", description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Global Controls</CardTitle>
                        <CardDescription>Changes here affect all users immediately.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <FormField
                            control={form.control}
                            name="isMaintenanceMode"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                    <div className="space-y-0.5">
                                        <FormLabel className="text-base">Maintenance Mode</FormLabel>
                                        <FormDescription>
                                            If enabled, the entire site will be inaccessible to non-admin users.
                                        </FormDescription>
                                    </div>
                                    <FormControl>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="allowNewTournaments"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                    <div className="space-y-0.5">
                                        <FormLabel className="text-base">Allow New Tournaments</FormLabel>
                                        <FormDescription>
                                            If disabled, users will not be able to create new tournaments.
                                        </FormDescription>
                                    </div>
                                    <FormControl>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Social Media Links</CardTitle>
                        <CardDescription>Enter the full URLs for your social media pages. Leave blank to hide an icon.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-6">
                         <FormField control={form.control} name="whatsappUrl" render={({ field }) => (<FormItem><FormLabel>WhatsApp URL</FormLabel><FormControl><Input placeholder="https://wa.me/..." {...field} /></FormControl><FormMessage /></FormItem>)} />
                         <FormField control={form.control} name="facebookUrl" render={({ field }) => (<FormItem><FormLabel>Facebook URL</FormLabel><FormControl><Input placeholder="https://facebook.com/..." {...field} /></FormControl><FormMessage /></FormItem>)} />
                         <FormField control={form.control} name="instagramUrl" render={({ field }) => (<FormItem><FormLabel>Instagram URL</FormLabel><FormControl><Input placeholder="https://instagram.com/..." {...field} /></FormControl><FormMessage /></FormItem>)} />
                         <FormField control={form.control} name="youtubeUrl" render={({ field }) => (<FormItem><FormLabel>YouTube URL</FormLabel><FormControl><Input placeholder="https://youtube.com/..." {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </CardContent>
                </Card>
                
                <div className="flex justify-end">
                    <Button type="submit" size="lg" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                        Save All Settings
                    </Button>
                </div>
            </form>
        </Form>
    );
}
