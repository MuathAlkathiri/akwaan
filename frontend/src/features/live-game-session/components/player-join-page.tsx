"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { teamIdentity, TEAM_SLOT_ORDER } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  joinLiveSession,
  reconnectLiveParticipant,
  resolveJoinCode,
} from "../api/live-session-api";
import type { ParticipantCredential } from "../model";
import { participantCredentialStorage } from "../storage/participant-credential-storage";
import { LiveSessionProvider } from "./live-session-provider";
import { PlayerLobby } from "./player-lobby";
import {
  PLAYER_CHARACTER_KEYS,
  PLAYER_CHARACTERS,
  PlayerCharacterIcon,
} from "./player-characters";

/** The server's code for a character someone else took while we were choosing. */
function errorCode(error: unknown): string | undefined {
  const response = (error as { response?: { data?: { code?: unknown } } })
    ?.response;
  return typeof response?.data?.code === "string"
    ? response.data.code
    : undefined;
}

/**
 * A human display name, Unicode-aware, matching the server's own rule.
 *
 * `\p{M}` is the fix: Arabic diacritics are *combining marks*, not letters, so a
 * letters-and-numbers pattern rejected "مُعاذ" while accepting "معاذ". It stays a
 * whitelist rather than free text — format characters are still excluded, which
 * is what keeps bidi overrides out of a name every phone in the room renders.
 */
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{M}\p{N} _-]*$/u;

const formSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(40)
    .regex(DISPLAY_NAME_PATTERN, "استخدم الحروف والأرقام فقط"),
  requestedTeamId: z.string().optional(),
  avatarKey: z.string().optional(),
});

type JoinForm = z.infer<typeof formSchema>;

export function PlayerJoinPage({ joinCode }: { joinCode: string }) {
  const [participant, setParticipant] = useState<ParticipantCredential>();
  /** Set when a character we were holding was taken by somebody else first. */
  const [characterTakenFromUs, setCharacterTakenFromUs] = useState(false);
  const restoredCodeRef = useRef<string>();
  const metadata = useQuery({
    queryKey: ["live-game-session-join", joinCode],
    queryFn: () => resolveJoinCode(joinCode),
    retry: false,
  });
  const form = useForm<JoinForm>({
    resolver: zodResolver(formSchema),
    defaultValues: { displayName: "", requestedTeamId: undefined },
  });
  const reconnect = useMutation({
    mutationFn: reconnectLiveParticipant,
    onSuccess: (value) => {
      participantCredentialStorage.set(joinCode, value);
      setParticipant(value);
    },
    onError: () => participantCredentialStorage.remove(joinCode),
  });
  const join = useMutation({
    mutationFn: (values: JoinForm) => {
      const selectedTeam = metadata.data?.teams.find(
        (team) => team.id === values.requestedTeamId,
      );
      const teamOnlyJoin =
        metadata.data?.mode.key === "bomb" &&
        metadata.data.assignmentPolicy === "explicit";
      return joinLiveSession(joinCode, {
        requestedTeamId: values.requestedTeamId,
        avatarKey: values.avatarKey,
        displayName: teamOnlyJoin
          ? (selectedTeam?.name ?? "لاعب")
          : values.displayName,
        joinRequestId: crypto.randomUUID(),
        device: {
          label: "متصفح الجوال",
          platform:
            typeof navigator === "undefined" ? undefined : navigator.platform,
        },
      });
    },
    onSuccess: (value) => {
      participantCredentialStorage.set(joinCode, value);
      setParticipant(value);
    },
    onError: (error) => {
      // Two people scanning in the same second is the normal case in a living
      // room, not an edge case: whoever lands second is told, shown the room as
      // it now stands, and given a free character to tap.
      if (errorCode(error) === "AVATAR_TAKEN") {
        form.setValue("avatarKey", undefined);
        void metadata.refetch();
      }
    },
  });

  // Memoised because the pre-pick effect below depends on them: a fresh array
  // each render would re-run it on every render.
  const taken = useMemo(
    () => metadata.data?.takenAvatarKeys ?? [],
    [metadata.data?.takenAvatarKeys],
  );
  const freeCharacters = useMemo(
    () => PLAYER_CHARACTER_KEYS.filter((key) => !taken.includes(key)),
    [taken],
  );
  const chosenCharacter = form.watch("avatarKey");

  // One is picked for the player the moment the room answers, so the common
  // path is a name and a colour. Pre-picking also means the player sees who
  // they will be before they commit, which is the point of having characters.
  //
  // It waits for the room, and it moves off a character that is gone. Picking
  // before the room answered left the phone holding a taken character and
  // failing the join on a choice the player never made — the worst version of
  // this, because there is nothing for them to have done differently.
  useEffect(() => {
    if (!metadata.data || freeCharacters.length === 0) return;
    if (chosenCharacter && !taken.includes(chosenCharacter)) return;
    if (chosenCharacter) setCharacterTakenFromUs(true);
    form.setValue("avatarKey", freeCharacters[0]);
  }, [chosenCharacter, freeCharacters, form, metadata.data, taken]);

  useEffect(() => {
    if (restoredCodeRef.current === joinCode) return;
    restoredCodeRef.current = joinCode;
    const stored = participantCredentialStorage.get(joinCode);
    if (stored) {
      reconnect.mutate(stored.credential);
    }
  }, [joinCode, reconnect]);

  if (participant) {
    return (
      <LiveSessionProvider
        sessionId={participant.sessionId}
        participantCredential={participant.credential}
        initialSnapshot={participant.snapshot}
      >
        <PlayerLobby participantId={participant.participantId} />
      </LiveSessionProvider>
    );
  }
  if (metadata.isLoading || reconnect.isPending) {
    return (
      <div dir="rtl" className="mx-auto max-w-md space-y-4 px-4 py-10">
        <Skeleton className="h-16 w-full rounded-[var(--radius)]" />
        <Skeleton className="h-72 w-full rounded-[var(--radius)]" />
      </div>
    );
  }
  if (metadata.error || !metadata.data) {
    return (
      <div dir="rtl" className="mx-auto mt-10 max-w-md px-4">
        <Alert variant="destructive" role="alert">
          <AlertTitle className="font-black">الكود ما ضبط</AlertTitle>
          <AlertDescription>
            الكود غلط أو منتهي أو ما عاد يستقبل لاعبين. اطلب من المضيف كودًا
            جديدًا.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const requiresTeam = metadata.data.assignmentPolicy === "explicit";
  const teamOnlyJoin = metadata.data.mode.key === "bomb" && requiresTeam;
  // A tie marks nothing: with the sides even there is no nudge to give, and
  // highlighting one would be an arbitrary push.
  const counted = metadata.data.teams.filter(
    (team) => team.playerCount !== undefined,
  );
  const fewest = Math.min(...counted.map((team) => team.playerCount ?? 0));
  const smallestTeamId =
    counted.length === metadata.data.teams.length &&
    counted.filter((team) => team.playerCount === fewest).length === 1
      ? counted.find((team) => team.playerCount === fewest)?.id
      : undefined;

  return (
    <div dir="rtl" className="mx-auto min-h-dvh max-w-md px-4 py-8">
      <div className="mb-5 text-center">
        <div className="relative mx-auto mb-3 h-10 w-28">
          <Image
            src="/brand/akwaan-logo.png"
            alt="أكوان"
            fill
            priority
            sizes="112px"
            className="object-contain"
          />
        </div>
        <Badge variant="secondary" className="gap-1.5 font-bold">
          <Users className="size-3" aria-hidden />
          كود الدخول
          <span className="akwaan-numeral font-black tracking-[0.15em]">
            {joinCode}
          </span>
        </Badge>
      </div>

      <Card className="surface-card border-0 shadow-none">
        <CardHeader className="pb-3 text-center">
          <CardTitle className="text-2xl font-black">مين أنت؟</CardTitle>
          <p className="text-sm text-muted-foreground">
            اكتب اسمك واختر فريقك، وجوالك يتحدّث لحاله مع كل تحدي.
          </p>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              className="space-y-5"
              onSubmit={form.handleSubmit((values) => {
                if (requiresTeam && !values.requestedTeamId) {
                  form.setError("requestedTeamId", {
                    message: "اختر فريقك",
                  });
                  return;
                }
                if (!teamOnlyJoin && !values.displayName.trim()) {
                  form.setError("displayName", {
                    message: "اكتب اسمك مثل ما تحب يشوفونه",
                  });
                  return;
                }
                join.mutate(values);
              })}
            >
              {!teamOnlyJoin && (
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-black">اسمك</FormLabel>
                      <FormControl>
                        <Input
                          autoComplete="nickname"
                          inputMode="text"
                          maxLength={40}
                          placeholder="مثال: مُعاذ"
                          className="h-12 text-base"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {!teamOnlyJoin && (
                <FormField
                  control={form.control}
                  name="avatarKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-black">
                        شخصيتك
                        <span className="ms-1 font-normal text-muted-foreground">
                          — اخترنا لك وحدة، بدّلها إذا ما عجبتك
                        </span>
                      </FormLabel>
                      <FormControl>
                        {/* All twelve at once rather than a carousel: a player
                            should see what is left at a glance, and scrolling
                            hides exactly the choice they came to make. Taken
                            ones stay visible and disabled — part of the fun is
                            seeing that someone is already the rocket, and
                            removing tiles would shift the grid under a thumb
                            mid-tap. */}
                        <div
                          role="radiogroup"
                          aria-label="شخصيتك"
                          className="grid grid-cols-4 gap-2"
                        >
                          {PLAYER_CHARACTER_KEYS.map((key) => {
                            const isTaken = taken.includes(key);
                            const selected = field.value === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                aria-label={PLAYER_CHARACTERS[key].label}
                                disabled={isTaken}
                                data-character-option={key}
                                data-taken={isTaken ? "true" : "false"}
                                onClick={() => field.onChange(key)}
                                className={cn(
                                  "grid min-h-16 place-items-center rounded-[var(--radius)] border-2 p-1.5 transition-colors duration-base ease-akwaan",
                                  selected
                                    ? "border-foreground bg-muted"
                                    : "border-border bg-card",
                                  isTaken && "cursor-not-allowed opacity-35",
                                )}
                              >
                                <PlayerCharacterIcon
                                  characterKey={key}
                                  size={38}
                                />
                              </button>
                            );
                          })}
                        </div>
                      </FormControl>
                      {(characterTakenFromUs ||
                        errorCode(join.error) === "AVATAR_TAKEN") && (
                        <p
                          role="alert"
                          className="text-sm font-bold text-destructive"
                        >
                          أحد سبقك عليها، فاخترنا لك غيرها.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {requiresTeam && (
                <FormField
                  control={form.control}
                  name="requestedTeamId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-black">وش فريقك؟</FormLabel>
                      <FormControl>
                        {/* Two big targets rather than a dropdown: on a phone,
                            picking a team is the whole interaction. */}
                        <RadioGroup
                          /* "" and not undefined: Radix reads undefined as an
                             uncontrolled group and warns the moment a team is
                             picked. */
                          value={field.value ?? ""}
                          onValueChange={field.onChange}
                          className="grid grid-cols-2 gap-3"
                        >
                          {metadata.data!.teams.map((team, index) => {
                            const identity = teamIdentity(
                              TEAM_SLOT_ORDER[index % TEAM_SLOT_ORDER.length],
                            );
                            const selected = field.value === team.id;
                            const count = team.playerCount;
                            // Marked, never forced. People tap the suggestion,
                            // so the teams even out on their own — and anyone
                            // who wants to be with their friends still can.
                            const isSmaller =
                              smallestTeamId === team.id &&
                              metadata.data!.teams.length > 1;
                            return (
                              // A plain label wrapping the radio, not FormLabel:
                              // shadcn's FormLabel points `htmlFor` at the form
                              // item, so clicking it focused the group instead of
                              // choosing the team.
                              <label
                                key={team.id}
                                data-team-option={team.id}
                                data-selected={selected ? "true" : "false"}
                                className={cn(
                                  "flex min-h-16 cursor-pointer items-center gap-2 rounded-[var(--radius)] border-2 px-3 py-3 text-sm font-black transition-colors duration-base ease-akwaan",
                                  identity.surface,
                                  selected
                                    ? cn(
                                        identity.border,
                                        "ring-2",
                                        identity.ring,
                                      )
                                    : "border-transparent",
                                  identity.text,
                                )}
                              >
                                {/* The radio stays visible: it is the control,
                                    and it doubles as the team's colour marker,
                                    so selection never rests on colour alone. */}
                                <RadioGroupItem
                                  value={team.id}
                                  className={cn(
                                    "shrink-0",
                                    selected && identity.border,
                                  )}
                                />
                                <span className="min-w-0 flex-1 leading-tight">
                                  <span className="block break-words">
                                    {team.name}
                                  </span>
                                  {count !== undefined && (
                                    <span className="mt-0.5 block text-xs font-bold opacity-80">
                                      {count === 0
                                        ? "ما فيه أحد"
                                        : `${count} لاعبين`}
                                    </span>
                                  )}
                                </span>
                                {isSmaller && (
                                  <span
                                    data-smaller-team="true"
                                    className="shrink-0 rounded-full border-2 border-foreground bg-[hsl(var(--brand-gold))] px-2 py-0.5 text-[11px] font-black text-foreground"
                                  >
                                    ناقصهم
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {metadata.data.assignmentPolicy === "host-assigned" && (
                <p className="text-sm text-muted-foreground">
                  المضيف يحدد فريقك بعد ما تدخل.
                </p>
              )}

              {/* The character clash has its own line beside the grid, where
                  the fix is. Showing "the game may be full" as well would send
                  the player looking for the host over something they can solve
                  with one tap. */}
              {join.error && errorCode(join.error) !== "AVATAR_TAKEN" && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription className="font-bold">
                    ما قدرنا ندخلك. يمكن اللعبة امتلأت أو ما عادت متاحة.
                  </AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                size="lg"
                className="h-12 w-full text-base font-black"
                disabled={join.isPending}
              >
                <CheckCircle2 className="size-5" aria-hidden />
                {join.isPending ? "ندخلك…" : "يلا ندخل"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
