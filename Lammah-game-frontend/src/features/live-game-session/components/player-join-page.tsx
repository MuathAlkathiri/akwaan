"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
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
import { teamIdentity, TEAM_TONE_ORDER } from "@/lib/team-identity";
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
});

type JoinForm = z.infer<typeof formSchema>;

export function PlayerJoinPage({ joinCode }: { joinCode: string }) {
  const [participant, setParticipant] = useState<ParticipantCredential>();
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
  });

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
          <AlertTitle className="font-black">رمز غير صالح</AlertTitle>
          <AlertDescription>
            هذا الرمز غير صحيح أو منتهي أو لم يعد يستقبل لاعبين. اطلب من المضيف
            رمزًا جديدًا.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const requiresTeam = metadata.data.assignmentPolicy === "explicit";
  const teamOnlyJoin = metadata.data.mode.key === "bomb" && requiresTeam;

  return (
    <div dir="rtl" className="mx-auto min-h-dvh max-w-md px-4 py-8">
      <div className="mb-5 text-center">
        <div className="relative mx-auto mb-3 h-10 w-28">
          <Image
            src="/brand/lammah-logo.png"
            alt="أكوان"
            fill
            priority
            sizes="112px"
            className="object-contain"
          />
        </div>
        <Badge variant="secondary" className="gap-1.5 font-bold">
          <Users className="size-3" aria-hidden />
          رمز الانضمام
          <span className="akwaan-numeral font-black tracking-[0.15em]">
            {joinCode}
          </span>
        </Badge>
      </div>

      <Card className="surface-card border-0 shadow-none">
        <CardHeader className="pb-3 text-center">
          <CardTitle className="text-2xl font-black">انضم إلى اللعبة</CardTitle>
          <p className="text-sm text-muted-foreground">
            اكتب اسمك واختر فريقك، وسيتحدّث جوالك تلقائيًا مع كل تحدٍ.
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
                    message: "اكتب اسمك كما تحب أن يظهر",
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

              {requiresTeam && (
                <FormField
                  control={form.control}
                  name="requestedTeamId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-black">فريقك</FormLabel>
                      <FormControl>
                        {/* Two big targets rather than a dropdown: on a phone,
                            picking a team is the whole interaction. */}
                        <RadioGroup
                          value={field.value}
                          onValueChange={field.onChange}
                          className="grid grid-cols-2 gap-3"
                        >
                          {metadata.data!.teams.map((team, index) => {
                            const identity = teamIdentity(
                              TEAM_TONE_ORDER[index % TEAM_TONE_ORDER.length],
                            );
                            const selected = field.value === team.id;
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
                                    ? cn(identity.border, "ring-2", identity.ring)
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
                                <span className="min-w-0 flex-1 break-words leading-tight">
                                  {team.name}
                                </span>
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
                  سيحدد المضيف فريقك بعد الانضمام.
                </p>
              )}

              {join.error && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription className="font-bold">
                    تعذّر الانضمام. قد تكون اللعبة ممتلئة أو لم تعد متاحة.
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
                {join.isPending ? "جارٍ الانضمام…" : "انضم"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
