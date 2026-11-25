"use client";

import { createContext, useContext, useState } from "react";
import { Crown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { setTeamCaptain } from "../../api/live-session-api";
import { useLiveSession } from "../../hooks/live-session-context";

/**
 * Whether this surface may change a team's captain. Set by the Match shell,
 * which knows the actor; a screen rendered outside it gets no control.
 */
export const CaptainControlContext = createContext(false);

/**
 * The crown: who decides for each team. It lives in the header during play and
 * beside «جاهزية اللاعبين» before a challenge, where the host is already
 * looking at who is on each side.
 */
export function CaptainControl({ compact = false }: { compact?: boolean }) {
  const allowed = useContext(CaptainControlContext);
  const { snapshot, resync } = useLiveSession();
  const [pending, setPending] = useState(false);
  if (!allowed) return null;

  const run = async (action: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true);
    try {
      await action();
      resync?.();
    } catch {
      toast.error("تعذر تنفيذ الإجراء. حدّث الصفحة وحاول مرة ثانية.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="تغيير قائد الفريق"
          className={cn(
            "grid shrink-0 place-items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white shadow-[3px_4px_0_hsl(var(--brand-navy))] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--brand-purple))]",
            compact ? "size-10" : "size-12",
          )}
        >
          <Crown
            className={cn(
              "fill-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))]",
              compact ? "size-5" : "size-6",
            )}
            aria-hidden
          />
        </button>
      </DialogTrigger>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>قائد الفريق</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {snapshot?.teams.map((team) => {
            const side = snapshot.participants.filter(
              (person) =>
                person.teamId === team.id &&
                person.role === "team-player" &&
                person.presence !== "removed",
            );
            const captainId = side.some(
              (person) => person.id === team.captainParticipantId,
            )
              ? team.captainParticipantId
              : undefined;
            return (
              <div key={team.id}>
                <label
                  htmlFor={`match-captain-${team.id}`}
                  className="mb-1.5 flex items-center gap-2 text-sm font-black"
                >
                  <span
                    className={`size-3 rounded-full ${teamIdentityOf(team.id, snapshot.teams).dot}`}
                    aria-hidden
                  />
                  {team.name} — قائد الفريق
                </label>
                <select
                  id={`match-captain-${team.id}`}
                  data-testid={`match-captain-${team.id}`}
                  value={captainId ?? ""}
                  disabled={pending || side.length === 0}
                  onChange={(event) =>
                    void run(() =>
                      setTeamCaptain(
                        snapshot.sessionId,
                        team.id,
                        event.target.value || null,
                        snapshot.revision,
                      ),
                    )
                  }
                  className="bg-background focus-visible:ring-ring h-11 w-full rounded-[12px] border px-3 text-base font-bold focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
                >
                  <option value="">بدون قائد</option>
                  {side.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName}
                      {person.id === captainId ? " — القائد الحالي" : ""}
                      {person.presence === "connected" ? "" : " — غير متصل"}
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground mt-1.5 text-xs font-bold">
                  بدون قائد = تناوب تلقائي بين لاعبي الفريق. تقدر تختار لاعبًا
                  غير متصل، وبيستلم أول ما يرجع جهازه.
                </p>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
