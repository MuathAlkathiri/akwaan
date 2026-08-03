"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { WorldSidebar } from "../worlds";
import type { World } from "../../types";

interface MobileWorldSelectorProps {
  worlds: World[];
  isLoading: boolean;
  selectedWorld?: World;
  selectedWorldId?: string;
  onSelect: (worldId: string) => void;
}

/** Collapses the World list into a dialog below `lg`. */
export function MobileWorldSelector({
  worlds,
  isLoading,
  selectedWorld,
  selectedWorldId,
  onSelect,
}: MobileWorldSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <Button
        variant="outline"
        className="w-full justify-between"
        onClick={() => setOpen(true)}
      >
        {selectedWorld ? selectedWorld.name : "اختر عالماً"}
        <ChevronDown className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-3rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>العوالم</DialogTitle>
          </DialogHeader>
          <WorldSidebar
            worlds={worlds}
            isLoading={isLoading}
            selectedWorldId={selectedWorldId}
            onSelect={(worldId) => {
              onSelect(worldId);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
