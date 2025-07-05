
import { getArticles } from '@/lib/actions';
import type { Article, UnifiedTimestamp } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { format } from 'date-fns';
import { Newspaper, BookOpen } from 'lucide-react';

const toDate = (timestamp: UnifiedTimestamp): Date => {
    if (typeof timestamp === 'string') {
        return new Date(timestamp);
    }
    if (timestamp && typeof (timestamp as any).toDate === 'function') {
        return (timestamp as any).toDate();
    }
    return timestamp as Date;
};

function ArticleCard({ article }: { article: Article }) {
    return (
        <Link href={`/community/articles/${article.slug}`}>
            <Card className="h-full flex flex-col hover:border-primary/50 transition-colors">
                <CardHeader>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{article.authorName}</span>
                        <span>•</span>
                        <span>{format(toDate(article.createdAt), 'PPP')}</span>
                    </div>
                    <CardTitle className="font-headline text-xl">{article.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex-grow">
                    <p className="text-muted-foreground text-sm">{article.excerpt}</p>
                </CardContent>
                <CardFooter>
                    {article.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="mr-2 capitalize">{tag.replace('-', ' ')}</Badge>
                    ))}
                </CardFooter>
            </Card>
        </Link>
    );
}

export default async function CommunityPage() {
    const articles = await getArticles();
    const news = articles.filter(a => a.type === 'news');
    const guides = articles.filter(a => a.type === 'guide');

    return (
        <div className="container py-10 space-y-12">
            <div className="text-center">
                <h1 className="text-4xl font-bold font-headline">Community Hub</h1>
                <p className="max-w-2xl mx-auto mt-2 text-muted-foreground">
                    Your source for official eArena news, gameplay guides, and platform updates.
                </p>
            </div>

            <section>
                <h2 className="text-2xl font-headline font-semibold mb-6 flex items-center gap-3">
                    <Newspaper className="text-primary"/>
                    Latest News & Updates
                </h2>
                {news.length > 0 ? (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {news.map(article => (
                            <ArticleCard key={article.id} article={article} />
                        ))}
                    </div>
                ) : (
                    <p className="text-muted-foreground">No news yet. Check back soon!</p>
                )}
            </section>
            
            <section>
                <h2 className="text-2xl font-headline font-semibold mb-6 flex items-center gap-3">
                    <BookOpen className="text-primary"/>
                    Guides & Resources
                </h2>
                 {guides.length > 0 ? (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {guides.map(article => (
                            <ArticleCard key={article.id} article={article} />
                        ))}
                    </div>
                ) : (
                    <p className="text-muted-foreground">No guides have been published yet.</p>
                )}
            </section>
        </div>
    );
}
