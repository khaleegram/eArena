
import { getArticleBySlug } from "@/lib/actions";
import type { UnifiedTimestamp } from "@/lib/types";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { notFound } from "next/navigation";
import { Separator } from "@/components/ui/separator";

const toDate = (timestamp: UnifiedTimestamp): Date => {
    if (typeof timestamp === 'string') {
        return new Date(timestamp);
    }
    if (timestamp && typeof (timestamp as any).toDate === 'function') {
        return (timestamp as any).toDate();
    }
    return timestamp as Date;
};

export default async function ArticlePage({ params }: { params: { slug: string } }) {
    const article = await getArticleBySlug(params.slug);

    if (!article) {
        notFound();
    }

    return (
        <div className="container max-w-4xl mx-auto py-12 md:py-20">
            <article className="space-y-6">
                <header className="space-y-3 text-center">
                    <div className="space-x-2">
                        {article.tags.map(tag => (
                            <Badge key={tag} variant="secondary" className="capitalize">{tag.replace('-', ' ')}</Badge>
                        ))}
                    </div>
                    <h1 className="text-4xl md:text-5xl font-headline font-bold">{article.title}</h1>
                    <div className="text-muted-foreground text-sm">
                        <span>By {article.authorName}</span>
                        <span className="mx-2">•</span>
                        <span>Published on {format(toDate(article.createdAt), 'PPP')}</span>
                    </div>
                </header>

                <Separator />
                
                <div className="prose prose-invert max-w-none text-lg leading-relaxed">
                   <pre className="whitespace-pre-wrap font-body text-foreground">
                        {article.content}
                   </pre>
                </div>
            </article>
        </div>
    );
}
