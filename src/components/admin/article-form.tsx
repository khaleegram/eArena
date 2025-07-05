
"use client"

import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { adminCreateArticle, adminUpdateArticle } from '@/lib/actions';
import type { Article } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Send } from 'lucide-react';

const formSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters long."),
  slug: z.string().min(3, "Slug must be at least 3 characters long.").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug can only contain lowercase letters, numbers, and hyphens."),
  excerpt: z.string().min(20, "Excerpt must be at least 20 characters long.").max(200, "Excerpt cannot be longer than 200 characters."),
  content: z.string().min(50, "Content must be at least 50 characters long."),
  type: z.enum(['news', 'guide']),
  tags: z.string().refine(tags => tags.split(',').every(tag => tag.trim().length > 0), {
      message: "Tags must be a comma-separated list of words."
  }).optional(),
});

type ArticleFormValues = z.infer<typeof formSchema>;

interface ArticleFormProps {
    article?: Article;
}

export function ArticleForm({ article }: ArticleFormProps) {
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();
    const [isLoading, setIsLoading] = React.useState(false);

    const isEditMode = !!article;

    const form = useForm<ArticleFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: article?.title || '',
            slug: article?.slug || '',
            excerpt: article?.excerpt || '',
            content: article?.content || '',
            type: article?.type || 'news',
            tags: article?.tags?.join(', ') || '',
        }
    });

    const watchedTitle = useWatch({ control: form.control, name: 'title' });

    React.useEffect(() => {
        if (!isEditMode && watchedTitle) {
            const newSlug = watchedTitle
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9\s-]/g, '') // remove non-alphanumeric characters except spaces and hyphens
                .replace(/\s+/g, '-') // replace spaces with hyphens
                .replace(/-+/g, '-'); // replace multiple hyphens with a single one
            form.setValue('slug', newSlug);
        }
    }, [watchedTitle, form, isEditMode]);


    const onSubmit = async (values: ArticleFormValues) => {
        if (!user) {
            toast({ variant: 'destructive', title: "Not Authorized" });
            return;
        }

        setIsLoading(true);
        try {
            const dataToSubmit = {
                ...values,
                tags: values.tags ? values.tags.split(',').map(tag => tag.trim()) : [],
                authorId: user.uid,
                authorName: user.displayName || 'Admin',
            };

            if (isEditMode) {
                await adminUpdateArticle(article.id, dataToSubmit);
                toast({ title: "Success!", description: "Article has been updated." });
                router.push('/admin/community');
            } else {
                await adminCreateArticle(dataToSubmit);
                toast({ title: "Success!", description: "Article has been created." });
                router.push('/admin/community');
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Error", description: error.message });
        } finally {
            setIsLoading(false);
        }
    };


    return (
        <Card>
            <CardContent className="pt-6">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Article Title</FormLabel>
                                    <FormControl><Input placeholder="e.g., Welcome to Season 2!" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="slug"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>URL Slug</FormLabel>
                                    <FormControl><Input placeholder="e.g., welcome-to-season-2" {...field} disabled={isEditMode} /></FormControl>
                                    <FormDescription>This is the unique identifier for the URL. Generated automatically from title on creation.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="excerpt"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Excerpt</FormLabel>
                                    <FormControl><Textarea placeholder="A short summary of the article..." {...field} /></FormControl>
                                    <FormDescription>This is shown on the community hub page cards.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="content"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Full Content</FormLabel>
                                    <FormControl><Textarea placeholder="Write the full article content here..." {...field} rows={15} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="grid md:grid-cols-2 gap-8">
                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Article Type</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="news">News</SelectItem>
                                            <SelectItem value="guide">Guide</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="tags"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tags</FormLabel>
                                        <FormControl><Input placeholder="e.g., patch-notes, gameplay" {...field} /></FormControl>
                                        <FormDescription>Comma-separated list of tags.</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                         <div className="flex justify-end">
                            <Button type="submit" size="lg" disabled={isLoading}>
                                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
                                {isEditMode ? 'Save Changes' : 'Publish Article'}
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
