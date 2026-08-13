"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { createLiveSession } from "../api/live-session-api";

const creatorSchema = z.object({
  firstTeam: z.string().trim().min(1).max(80),
  secondTeam: z.string().trim().min(1).max(80),
});
type CreatorValues = z.infer<typeof creatorSchema>;

export function LiveSessionCreator() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string>();
  const form = useForm<CreatorValues>({
    resolver: zodResolver(creatorSchema),
    defaultValues: { firstTeam: "Team One", secondTeam: "Team Two" },
  });

  async function submit(values: CreatorValues) {
    setSubmitError(undefined);
    try {
      const created = await createLiveSession({
        teamNames: [values.firstTeam, values.secondTeam],
      });
      window.sessionStorage.setItem(
        `live-session-reconnect:${created.snapshot.sessionId}`,
        created.reconnectToken,
      );
      router.push(`/admin/live-sessions/${created.snapshot.sessionId}`);
    } catch {
      setSubmitError("Unable to create the live session.");
    }
  }

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>Realtime session demo</CardTitle>
        <CardDescription>
          Internal Phase 1 surface for the neutral timed-turn engine.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(submit)}
            noValidate
          >
            <FormField
              control={form.control}
              name="firstTeam"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First team</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="secondTeam"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Second team</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {submitError && (
              <p role="alert" className="text-sm text-destructive">
                {submitError}
              </p>
            )}
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating…" : "Create session"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
