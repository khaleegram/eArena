import { getTournamentById } from "@/lib/actions/tournament";
import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { absoluteUrl, buildMetadata, truncateMeta } from "@/lib/seo";
import type { UnifiedTimestamp } from "@/lib/types";

type Props = {
  params: Promise<{ id: string }> | { id: string };
  children: React.ReactNode;
};

async function resolveParams(params: Props["params"]) {
  return typeof (params as Promise<{ id: string }>).then === "function"
    ? await (params as Promise<{ id: string }>)
    : (params as { id: string });
}

function toIso(timestamp: UnifiedTimestamp | undefined): string | undefined {
  if (!timestamp) return undefined;
  if (typeof timestamp === "string") return new Date(timestamp).toISOString();
  if (timestamp instanceof Date) return timestamp.toISOString();
  if (typeof (timestamp as { toDate?: () => Date }).toDate === "function") {
    return (timestamp as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await resolveParams(params);
  const tournament = await getTournamentById(id);

  if (!tournament) {
    return buildMetadata({
      title: "Tournament Not Found",
      description: "This tournament could not be found on eArena.",
      path: `/tournaments/${id}`,
      noIndex: true,
    });
  }

  const imageUrl = tournament.flyerUrl || "/images/Tournament.png";
  const description = truncateMeta(
    tournament.description ||
      `${tournament.name} — ${tournament.game} on ${tournament.platform}. Join on eArena.`
  );

  return buildMetadata({
    title: tournament.name,
    description,
    path: `/tournaments/${tournament.id}`,
    image: imageUrl,
    noIndex: tournament.isPublic === false,
    keywords: [
      tournament.name,
      tournament.game,
      tournament.platform,
      "eFootball tournament",
      "eArena",
      tournament.format,
    ],
  });
}

export default async function TournamentLayout({ children, params }: Props) {
  const { id } = await resolveParams(params);
  const tournament = await getTournamentById(id);

  if (!tournament || tournament.isPublic === false) {
    return <>{children}</>;
  }

  const eventLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: tournament.name,
    description: truncateMeta(tournament.description, 300),
    url: absoluteUrl(`/tournaments/${tournament.id}`),
    image: tournament.flyerUrl || absoluteUrl("/images/Tournament.png"),
    startDate: toIso(tournament.tournamentStartDate),
    endDate: toIso(tournament.tournamentEndDate),
    eventStatus:
      tournament.status === "completed"
        ? "https://schema.org/EventCompleted"
        : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    location: {
      "@type": "VirtualLocation",
      url: absoluteUrl(`/tournaments/${tournament.id}`),
    },
    organizer: {
      "@type": "Organization",
      name: tournament.organizerUsername || "eArena Organizer",
    },
    sport: tournament.game,
    ...(tournament.rewardDetails?.type === "money" && tournament.rewardDetails.prizePool > 0
      ? {
          offers: {
            "@type": "Offer",
            price: tournament.rewardDetails.prizePool,
            priceCurrency: "NGN",
            availability: "https://schema.org/InStock",
            url: absoluteUrl(`/tournaments/${tournament.id}`),
          },
        }
      : {}),
  };

  return (
    <>
      <JsonLd data={eventLd} />
      {children}
    </>
  );
}
