
import { ArticleForm } from "@/components/admin/article-form";
import { getArticleBySlug } from "@/lib/actions";
import { notFound } from "next/navigation";

export default async function EditArticlePage({ params }: { params: { slug: string }}) {
    const article = await getArticleBySlug(params.slug);

    if (!article) {
        notFound();
    }
    
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Edit Article</h1>
                <p className="text-muted-foreground">Make changes to an existing article.</p>
            </div>
            <ArticleForm article={article} />
        </div>
    )
}
