"use client";

import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { WorldHeader } from "../worlds";
import { ScopeSection } from "../scopes";
import { BoardSection } from "../world-challenge-configurations";
import { ContentItemSection } from "../content-items";
import type { World } from "../../types";

/**
 * The selected World's workspace. Tabs keep the three World-scoped concerns
 * apart: what the content is about (scopes), which mechanics the World plays
 * (board), and the content itself.
 */
export function WorldWorkspace({ world }: { world: World }) {
  const [section, setSection] = useState("board");
  return (
    <div className="min-w-0 space-y-6">
      <WorldHeader
        world={world}
        onNavigate={(target) => target !== "mechanics" && setSection(target)}
      />
      <Tabs value={section} onValueChange={setSection}>
        <TabsList>
          <TabsTrigger value="board">لوحة التحديات</TabsTrigger>
          <TabsTrigger value="scopes">النطاقات</TabsTrigger>
          <TabsTrigger value="content">المحتوى</TabsTrigger>
        </TabsList>
        <TabsContent id="world-board" value="board" className="mt-4">
          <BoardSection worldId={world.id} />
        </TabsContent>
        <TabsContent id="world-scopes" value="scopes" className="mt-4">
          <ScopeSection worldId={world.id} />
        </TabsContent>
        <TabsContent id="world-content" value="content" className="mt-4">
          <ContentItemSection worldId={world.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
