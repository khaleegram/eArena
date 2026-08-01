import { getArticleBySlug } from "@/lib/actions";
import type { Metadata } from "next";
import type { UnifiedTimestamp } from "@/lib/types";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { notFound } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { JsonLd } from "@/components/json-ld";
import { absoluteUrl, buildMetadata, truncateMeta } from "@/lib/seo";

const toDate = (timestamp: UnifiedTimestamp): Date => {
  if (typeof timestamp === "string") {
    return new Date(timestamp);
  }
  if (timestamp && typeof (timestamp as { toDate?: () => Date }).toDate === "function") {
    return (timestamp as { toDate: () => Date }).toDate();
  }
  return timestamp as Date;
};

type Props = {
  params: Promise<{ slug: string }> | { slug: string };
};

async function resolveParams(params: Props["params"]) {
  return typeof (params as Promise<{ slug: string }>).then === "function"
    ? await (params as Promise<{ slug: string }>)
    : (params as { slug: string });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await resolveParams(params);
  const article = await getArticleBySlug(slug);

  if (!article) {
    return buildMetadata({
      title: "Article Not Found",
      path: `/community/articles/${slug}`,
      noIndex: true,
    });
  }

  return buildMetadata({
    title: article.title,
    description: truncateMeta(article.excerpt || article.content),
    path: `/community/articles/${article.slug}`,
    type: "article",
    keywords: [article.title, ...article.tags, "eArena", "eFootball", article.type],
  });
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await resolveParams(params);
  const article = await getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const published = toDate(article.createdAt);

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: truncateMeta(article.excerpt || article.content, 300),
    datePublished: published.toISOString(),
    author: {
      "@type": "Person",
      name: article.authorName,
    },
    publisher: {
      "@type": "Organization",
      name: "eArena",
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/icons/android/any-512.png"),
      },
    },
    mainEntityOfPage: absoluteUrl(`/community/articles/${article.slug}`),
    keywords: article.tags.join(", "),
  };

  return (
    <div className="container max-w-4xl mx-auto py-12 md:py-20">
      <JsonLd data={articleLd} />
      <article className="space-y-6">
        <header className="space-y-3 text-center">
          <div className="space-x-2">
            {article.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="capitalize">
                {tag.replace("-", " ")}
              </Badge>
            ))}
          </div>
          <h1 className="text-4xl md:text-5xl font-headline font-bold">{article.title}</h1>
          <div className="text-muted-foreground text-sm">
            <span>By {article.authorName}</span>
            <span className="mx-2">•</span>
            <span>Published on {format(published, "PPP")}</span>
          </div>
        </header>

        <Separator />

        <div className="prose prose-invert max-w-none text-lg leading-relaxed">
          <pre className="whitespace-pre-wrap font-body text-foreground">{article.content}</pre>
        </div>
      </article>
    </div>
  );
}
