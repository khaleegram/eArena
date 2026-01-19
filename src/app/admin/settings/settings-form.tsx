

'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';
import { updatePlatformSettings } from '@/lib/actions/settings';
import type { PlatformSettings } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription, FormMessage } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Music } from 'lucide-react';
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
    
    // Store file inputs separately from the main form data for handling
    const fileInputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

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
            const formData = new FormData();
            // Append all the regular form values
            Object.entries(values).forEach(([key, value]) => {
                formData.append(key, String(value));
            });

            // Append file uploads
            fileInputRefs.current.forEach((input, index) => {
                if (input && input.files && input.files[0]) {
                    formData.append(`backgroundMusic_${index}`, input.files[0]);
                }
            });
            
            // Append existing music URLs that weren't replaced
            settings.backgroundMusic?.forEach((url, index) => {
                const fileInput = fileInputRefs.current[index];
                if(url && (!fileInput || !fileInput.files || !fileInput.files[0])) {
                     formData.append(`existingBackgroundMusic_${index}`, url);
                }
            });


            await updatePlatformSettings(formData);
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

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Music /> Background Music</CardTitle>
                        <CardDescription>Upload up to 5 audio files for the background music playlist. Uploading a new file will replace the existing one for that slot.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {[0, 1, 2, 3, 4].map((index) => (
                           <FormItem key={index}>
                               <FormLabel>Track {index + 1}</FormLabel>
                               {settings.backgroundMusic?.[index] && <p className="text-xs text-muted-foreground">Current: {settings.backgroundMusic[index].split('/').pop()?.split('?')[0].split('%2F').pop()}</p>}
                               <FormControl>
                                   <Input 
                                      type="file" 
                                      accept="audio/mpeg, audio/wav, .mp3, .wav"
                                      ref={el => fileInputRefs.current[index] = el}
                                    />
                               </FormControl>
                           </FormItem>
                        ))}
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
