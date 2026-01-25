
import { getTournamentById } from "@/lib/actions/tournament";
import type { Metadata } from "next";

type Props = {
  params: { id: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tournament = await getTournamentById(params.id);

  if (!tournament) {
    return {
      title: "Tournament Not Found",
    };
  }

  // flyerUrl is absolute. Fallback is relative, which works with metadataBase in the root layout.
  const imageUrl = tournament.flyerUrl || '/images/Tournament.png';

  return {
    title: `${tournament.name} | eArena`,
    description: tournament.description,
    openGraph: {
      title: tournament.name,
      description: tournament.description,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: tournament.name,
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: tournament.name,
      description: tournament.description,
      images: [imageUrl],
    },
  };
}

export default function TournamentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
