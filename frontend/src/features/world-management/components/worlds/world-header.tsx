"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import {
  ContentThumbnail,
  EntityFormDialog,
  EntityStatusBadge,
} from "../shared";
import { WorldReadinessGuide } from "../readiness";
import { WorldForm } from "./world-form";
import { WorldStats } from "./world-stats";
import type { World } from "../../types";

export function WorldHeader({
  world,
  onNavigate,
}: {
  world: World;
  onNavigate?: (target: "board" | "content" | "scopes" | "mechanics") => void;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <ContentThumbnail url={world.banner?.url} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black">{world.name}</h2>
                <EntityStatusBadge status={world.status} />
              </div>
              <WorldStats
                world={world}
                variant="detailed"
                className="mt-1 text-sm"
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:ms-auto">
            <Button size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="me-1.5 size-3.5" />
              تعديل
            </Button>
          </div>
        </div>

        <WorldReadinessGuide world={world} onNavigate={onNavigate} />
      </CardContent>

      <EntityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="تعديل العالم"
      >
        <WorldForm world={world} onSuccess={() => setEditOpen(false)} />
      </EntityFormDialog>
    </Card>
  );
}
