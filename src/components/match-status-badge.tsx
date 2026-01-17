
"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Clock, CheckCircle, AlertTriangle, Hourglass } from "lucide-react";
import type { MatchStatus } from "@/lib/types";

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const statusInfo: Record<MatchStatus, { icon: React.ReactNode; label: string; className?: string }> = {
    scheduled: {
      icon: <Clock className="h-3 w-3" />,
      label: "Scheduled",
      className: "bg-muted text-muted-foreground border-transparent",
    },
    awaiting_confirmation: {
      icon: <Hourglass className="h-3 w-3" />,
      label: "Reviewing",
      className: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    },
    needs_secondary_evidence: {
      icon: <AlertTriangle className="h-3 w-3" />,
      label: "Needs Evidence",
      className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
    },
    disputed: {
      icon: <AlertTriangle className="h-3 w-3" />,
      label: "Disputed",
      className: "bg-destructive text-destructive-foreground border-transparent",
    },
    approved: {
      icon: <CheckCircle className="h-3 w-3" />,
      label: "Final",
      className: "bg-green-600/80 text-primary-foreground border-transparent",
    },
  };

  const current = statusInfo[status] || statusInfo.scheduled;

  return (
    <Badge variant="outline" className={cn("gap-1.5 px-2 py-0.5 uppercase text-[10px] font-bold tracking-wider", current.className)}>
      {current.icon}
      {current.label}
    </Badge>
  );
};
