"use client";

import { useState } from "react";
import { Globe2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState } from "@/components/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useWorlds } from "../../hooks/use-world-content";
import { useWorldSelection } from "../../hooks/use-world-selection";
import { EntityFormDialog } from "../shared";
import { WorldForm, WorldSidebar } from "../worlds";
import { ChallengeTypeCatalog } from "../challenge-types";
import { WorldWorkspace } from "./world-workspace";
import { MobileWorldSelector } from "./mobile-world-selector";

/**
 * Page-level composition only. The two top-level tabs keep the distinction the
 * architecture depends on: mechanics are global, everything else belongs to a
 * World.
 */
export function WorldManagementWorkspace() {
  const { data: worlds = [], isLoading } = useWorlds();
  const { selectedWorldId, selectedWorld, selectWorld } =
    useWorldSelection(worlds);
  const [addFirstWorldOpen, setAddFirstWorldOpen] = useState(false);

  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">إدارة العوالم</h1>
        <p className="text-sm text-muted-foreground">
          العالم ← النطاق ← نوع التحدي ← عنصر المحتوى
        </p>
      </div>

      <Tabs defaultValue="worlds">
        <TabsList>
          <TabsTrigger value="worlds">العوالم</TabsTrigger>
          <TabsTrigger value="mechanics">المكانيكا العامة</TabsTrigger>
        </TabsList>

        <TabsContent value="worlds" className="mt-4">
          {isLoading ? (
            <LoadingState count={3} />
          ) : !worlds.length ? (
            <div className="space-y-4">
              <EmptyState
                icon={Globe2}
                title="لا توجد عوالم بعد"
                description="ابدأ بإضافة أول عالم، مثل كرة القدم أو الأنمي أو الألعاب."
              />
              <div className="flex justify-center">
                <Button onClick={() => setAddFirstWorldOpen(true)}>
                  <Plus className="me-1.5 size-4" />
                  إضافة أول عالم
                </Button>
              </div>
            </div>
          ) : (
            <>
              <MobileWorldSelector
                worlds={worlds}
                isLoading={false}
                selectedWorld={selectedWorld}
                selectedWorldId={selectedWorldId}
                onSelect={selectWorld}
              />
              <div className="mt-4 grid items-start gap-6 lg:grid-cols-[20rem_1fr]">
                <div className="hidden lg:block">
                  <WorldSidebar
                    worlds={worlds}
                    isLoading={false}
                    selectedWorldId={selectedWorldId}
                    onSelect={selectWorld}
                  />
                </div>
                {selectedWorld ? (
                  <WorldWorkspace world={selectedWorld} />
                ) : (
                  <EmptyState title="اختر عالماً لعرض تفاصيله" />
                )}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="mechanics" className="mt-4">
          <ChallengeTypeCatalog />
        </TabsContent>
      </Tabs>

      <EntityFormDialog
        open={addFirstWorldOpen}
        onOpenChange={setAddFirstWorldOpen}
        title="إضافة عالم"
      >
        <WorldForm onSuccess={() => setAddFirstWorldOpen(false)} />
      </EntityFormDialog>
    </div>
  );
}
