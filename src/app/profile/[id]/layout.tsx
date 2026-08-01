import type { Metadata } from "next";
import { getUserProfileById, getPlayerStats } from "@/lib/actions/user";
import { JsonLd } from "@/components/json-ld";
import { absoluteUrl, buildMetadata, truncateMeta } from "@/lib/seo";

type Props = {
  params: Promise<{ id: string }> | { id: string };
  children: React.ReactNode;
};

async function resolveParams(params: Props["params"]) {
  return typeof (params as Promise<{ id: string }>).then === "function"
    ? await (params as Promise<{ id: string }>)
    : (params as { id: string });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await resolveParams(params);
  const profile = await getUserProfileById(id);

  if (!profile || profile.isBanned) {
    return buildMetadata({
      title: "Player Not Found",
      path: `/profile/${id}`,
      noIndex: true,
    });
  }

  const name = profile.username || "eArena Player";
  const stats = await getPlayerStats(id);
  const description = truncateMeta(
    `${name} on eArena — ${stats.totalWins} wins, ${stats.totalGoals} goals, ${profile.tournamentsWon || 0} trophies. View stats, achievements, and trophies.`
  );

  return buildMetadata({
    title: name,
    description,
    path: `/profile/${id}`,
    image: profile.photoURL || "/images/Tournament.png",
    type: "profile",
    keywords: [name, "eArena player", "eFootball profile", "player stats"],
  });
}

export default async function PublicProfileLayout({ children, params }: Props) {
  const { id } = await resolveParams(params);
  const profile = await getUserProfileById(id);

  if (!profile || profile.isBanned) {
    return <>{children}</>;
  }

  const stats = await getPlayerStats(id);
  const name = profile.username || "eArena Player";

  const personLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    url: absoluteUrl(`/profile/${id}`),
    image: profile.photoURL || undefined,
    description: truncateMeta(
      `${name} — ${stats.totalWins} wins, ${stats.totalGoals} goals on eArena.`,
      200
    ),
    memberOf: {
      "@type": "SportsOrganization",
      name: "eArena",
      url: absoluteUrl("/"),
    },
  };

  return (
    <>
      <JsonLd data={personLd} />
      {children}
    </>
  );
}
