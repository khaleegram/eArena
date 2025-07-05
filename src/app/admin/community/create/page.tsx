
import { ArticleForm } from "@/components/admin/article-form";

export default function CreateArticlePage() {
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Create New Article</h1>
                <p className="text-muted-foreground">Write and publish a new article for the Community Hub.</p>
            </div>
            <ArticleForm />
        </div>
    )
}
