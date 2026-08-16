"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import { Bomb, BrainCircuit, Check, CircleDot, Edit3, Eye, Lightbulb, Play, Sparkles, Target, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MATCH_SETUP_ROUTE } from "@/features/match-setup/routes";
import { OCCURRENCE_COUNT, SCOPES_PER_OCCURRENCE, createDraft, matchSetupReducer } from "@/features/match-setup/state/match-setup-draft";
import { readStoredDraft, writeStoredDraft } from "@/features/match-setup/state/match-setup-storage";
import { cn } from "@/lib/utils";
import { JourneyShell } from "./journey-shell";
import { JourneyError } from "./journey-error";
import { WorldCover, WorldIcon } from "./world-cover";
import { ScopeCardMedia } from "./scope-card-media";
import { usePlayableScopes, usePlayableWorlds } from "../hooks/use-player-catalog";
import { playableWorlds } from "../utils/featured-worlds";
import { isSelectableScope } from "../utils/scopes";
import type { PlayableScope, PlayableWorld } from "../types";

const HERO_MECHANICS = [
  { key: "read-your-opponent", label: "اقرأ خصمك", Icon: Eye, position: "node-ryo" },
  { key: "top-5", label: "توب 5", Icon: BrainCircuit, position: "node-top" },
  { key: "bomb", label: "القنبلة", Icon: Bomb, position: "node-bomb" },
  { key: "closest", label: "الأقرب", Icon: Target, position: "node-closest" },
  { key: "one-clue", label: "بدليل واحد", Icon: Lightbulb, position: "node-clue" },
] as const;

export function WorldsHome() {
  const query = usePlayableWorlds();
  const worlds = query.isSuccess ? playableWorlds(query.data) : [];
  const [draft, dispatch] = useReducer(matchSetupReducer, undefined, createDraft);
  const [restored, setRestored] = useState(false);
  const [dialog, setDialog] = useState<{ world: PlayableWorld; occurrenceIndex: number }>();
  const [pendingScopeIds, setPendingScopeIds] = useState<string[]>([]);

  useEffect(() => {
    const stored = readStoredDraft();
    if (stored) dispatch({ type: "restore", draft: stored });
    setRestored(true);
  }, []);
  useEffect(() => { if (restored) writeStoredDraft(draft); }, [draft, restored]);

  const openWorld = (world: PlayableWorld, occurrenceIndex?: number) => {
    const existing = occurrenceIndex === undefined ? draft.occurrences.find((item) => item.worldId === world.id) : draft.occurrences[occurrenceIndex];
    const target = existing ?? draft.occurrences.find((item) => !item.worldId);
    if (!target) return;
    setPendingScopeIds(target.worldId === world.id ? target.selectedScopeIds : []);
    setDialog({ world, occurrenceIndex: target.occurrenceIndex });
  };

  const confirmScopes = () => {
    if (!dialog || pendingScopeIds.length !== SCOPES_PER_OCCURRENCE) return;
    const current = draft.occurrences[dialog.occurrenceIndex];
    dispatch({ type: "choose-world", occurrenceIndex: dialog.occurrenceIndex, worldId: dialog.world.id });
    const previous = current.worldId === dialog.world.id ? current.selectedScopeIds : [];
    previous.filter((id) => !pendingScopeIds.includes(id)).forEach((scopeId) => dispatch({ type: "toggle-scope", occurrenceIndex: dialog.occurrenceIndex, scopeId }));
    pendingScopeIds.filter((id) => !previous.includes(id)).forEach((scopeId) => dispatch({ type: "toggle-scope", occurrenceIndex: dialog.occurrenceIndex, scopeId }));
    dispatch({ type: "confirm-scopes" });
    setDialog(undefined);
  };

  const selected = draft.occurrences.flatMap((occurrence) => {
    const world = worlds.find((entry) => entry.id === occurrence.worldId);
    return world ? [{ occurrence, world }] : [];
  });

  return <JourneyShell className="max-w-[1440px]">
    <div className="space-y-16 pb-8">
      <AkwaanHero />
      <section id="worlds" aria-labelledby="worlds-title" className="scroll-mt-24">
        <div className="mb-8 text-center"><p className="text-sm font-black text-[hsl(var(--brand-gold))]">اختياركم يصنع المباراة</p><h2 id="worlds-title" className="mt-2 text-3xl font-black sm:text-4xl">اختاروا عوالمكم</h2><p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">اختاروا ثلاثة عوالم، وأربعة نطاقات من كل عالم.</p></div>
        {query.isLoading ? <CardSkeletons count={4} /> : query.isError ? <JourneyError title="تعذر تحميل العوالم" description="تحقّق من اتصالك ثم حاول مرة أخرى." onRetry={() => void query.refetch()} retrying={query.isFetching} /> : worlds.length ? <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <ul className="grid list-none grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 xl:grid-cols-4">{worlds.map((world) => { const occurrence = draft.occurrences.find((item) => item.worldId === world.id); return <li key={world.id}><WorldSelectorItem world={world} selected={Boolean(occurrence)} disabled={selected.length >= OCCURRENCE_COUNT && !occurrence} onSelect={() => openWorld(world, occurrence?.occurrenceIndex)} /></li>; })}</ul>
          <SelectedWorldsRail selections={selected} onEdit={openWorld} onRemove={(occurrenceIndex) => dispatch({ type: "clear-occurrence", occurrenceIndex })} />
        </div> : <EmptyWorlds />}
      </section>
    </div>
    <WorldScopesDialog state={dialog} selectedScopeIds={pendingScopeIds} onSelectedScopeIdsChange={setPendingScopeIds} onClose={() => setDialog(undefined)} onConfirm={confirmScopes} />
  </JourneyShell>;
}

function AkwaanHero() {
  return <section className="akwaan-home-hero relative isolate -mx-4 overflow-hidden bg-[hsl(var(--brand-navy))] px-6 text-white sm:-mx-6 sm:px-10 lg:-mx-8 lg:grid lg:h-[clamp(420px,52vh,470px)] lg:grid-cols-[minmax(0,.92fr)_minmax(0,1.08fr)] lg:items-center lg:px-[max(4rem,calc((100vw-1440px)/2+4rem))]">
    <div className="relative z-20 max-w-[32rem] py-10 text-right lg:justify-self-start lg:py-0"><p className="text-xs font-black text-[hsl(var(--brand-gold))] sm:text-sm">اللعب اللي يجمعكم</p><h1 className="mt-3 text-[2.25rem] font-black leading-[1.32] sm:text-[2.55rem] lg:text-[2.7rem]">عالم تختارونه،<br />{" "}وتحديات تغيّر كل جولة.</h1><p className="mt-4 max-w-[29rem] text-sm leading-7 text-white/70 sm:text-base">اختاروا العوالم اللي تناسب جمعتكم، حدّدوا نطاقاتها، وابدأوا مباراة بتحديات مختلفة تخلي كل جولة لها طابعها.</p><Button asChild size="lg" className="mt-5 rounded-full bg-[hsl(var(--brand-gold))] px-6 font-black text-[hsl(var(--brand-navy))] hover:bg-[hsl(var(--brand-gold))]/90"><a href="#worlds"><Play className="ml-2 size-4 fill-current" />ابدأ مباراة</a></Button></div>
    <div className="akwaan-universe-stage relative z-10 min-h-[370px] lg:h-full lg:min-h-0" aria-label="تحديات أكوان">
      <HeroOrbitGraphic />
      <div className="akwaan-universe-core absolute left-1/2 top-1/2 grid size-[240px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[radial-gradient(circle_at_38%_32%,#38346f_0%,#26234f_48%,#1b193e_100%)] shadow-[0_0_0_18px_rgba(255,255,255,.025),0_0_68px_rgba(135,116,255,.16),0_22px_56px_rgba(0,0,0,.28)] sm:size-[260px] lg:size-[280px]"><span className="absolute inset-[17%] rounded-full border border-white/[.07]" /><CircleDot className="size-20 text-[hsl(var(--brand-gold))] lg:size-24" strokeWidth={1.1} /><span className="absolute bottom-[20%] text-base font-black tracking-wide lg:text-lg">أكوان</span></div>
      {HERO_MECHANICS.map(({ key, label, Icon, position }) => <div key={key} className={cn("challenge-orbit-node absolute z-20 flex items-center gap-2", position)}><span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/20 bg-[#292650] shadow-[0_7px_18px_rgba(0,0,0,.22)]"><Icon className="size-4 text-[hsl(var(--brand-gold))]" strokeWidth={1.8} /></span><span className="whitespace-nowrap text-xs font-black text-white/90 sm:text-[13px]">{label}</span></div>)}
    </div>
  </section>;
}

function HeroOrbitGraphic() { return <div aria-hidden className="akwaan-orbit-graphic absolute left-1/2 top-1/2 size-[340px] -translate-x-1/2 -translate-y-1/2 opacity-90 sm:size-[380px] lg:size-[400px]"><span className="absolute inset-[8%] rounded-full border border-white/10" /><span className="absolute inset-[17%] rotate-[-17deg] rounded-[46%] border border-[#b7a7ff]/16" /><span className="absolute left-[3%] top-[34%] h-[36%] w-[94%] rotate-12 rounded-[50%] border border-[hsl(var(--brand-gold)/.2)]" /><Sparkles className="absolute left-[13%] top-[11%] size-4 text-[hsl(var(--brand-gold)/.8)]" /><Sparkles className="absolute bottom-[13%] right-[9%] size-3 text-white/45" /><span className="absolute right-[13%] top-[23%] size-1.5 rounded-full bg-[#b7a7ff]" /><span className="absolute bottom-[17%] left-[19%] size-1 rounded-full bg-white/60" /><span className="absolute left-[4%] top-[54%] size-1 rounded-full bg-[hsl(var(--brand-gold))]" /></div>; }

function WorldSelectorItem({ world, selected, disabled, onSelect }: { world: PlayableWorld; selected: boolean; disabled: boolean; onSelect: () => void }) { return <button type="button" aria-pressed={selected} disabled={disabled} onClick={onSelect} className="group flex w-full flex-col items-center gap-3 rounded-3xl p-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40"><span className={cn("relative block aspect-square w-full max-w-48 overflow-hidden rounded-full border-2 bg-secondary shadow-[0_14px_35px_rgba(24,16,54,.1)] transition group-hover:-translate-y-1 group-hover:scale-[1.02]", selected ? "border-[hsl(var(--brand-gold))] ring-4 ring-primary/10" : "border-transparent")}><WorldCover world={world} sizes="(min-width:1280px) 180px, (min-width:640px) 25vw, 45vw" />{selected && <span className="absolute left-3 top-3 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-4" /></span>}</span><span className="text-lg font-black">{world.name}</span></button>; }

type Selection = { occurrence: { occurrenceIndex: number; selectedScopeIds: string[] }; world: PlayableWorld };
function SelectedWorldsRail({ selections, onEdit, onRemove }: { selections: Selection[]; onEdit: (world: PlayableWorld, index?: number) => void; onRemove: (index: number) => void }) { return <aside aria-label="العوالم المختارة" className="sticky top-28 rounded-[2rem] border border-primary/10 bg-card/90 p-5 shadow-[0_18px_50px_rgba(24,16,54,.08)]"><div className="flex items-center justify-between"><div><p className="text-xs font-black text-[hsl(var(--brand-gold))]">اختياراتكم</p><h3 className="mt-1 text-xl font-black">العوالم المختارة</h3></div><span className="akwaan-numeral rounded-full bg-primary px-3 py-1 text-sm font-black text-primary-foreground">{selections.length}/{OCCURRENCE_COUNT}</span></div><div className="mt-5 space-y-3">{selections.length ? selections.map(({ occurrence, world }) => <SelectedWorldRow key={occurrence.occurrenceIndex} occurrence={occurrence} world={world} onEdit={onEdit} onRemove={onRemove} />) : <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm leading-6 text-muted-foreground">اختاروا عالمًا لتظهر تفاصيله هنا.</div>}</div><Button asChild size="lg" className={cn("mt-5 w-full rounded-full font-black", selections.length !== OCCURRENCE_COUNT && "pointer-events-none opacity-45")}><Link href={MATCH_SETUP_ROUTE} aria-disabled={selections.length !== OCCURRENCE_COUNT}>متابعة إعداد المباراة</Link></Button></aside>; }

function SelectedWorldRow({ occurrence, world, onEdit, onRemove }: { occurrence: Selection["occurrence"]; world: PlayableWorld; onEdit: (world: PlayableWorld, index?: number) => void; onRemove: (index: number) => void }) { const scopes = usePlayableScopes(world.id); const names = (scopes.data ?? []).filter((scope) => occurrence.selectedScopeIds.includes(scope.id)).map((scope) => scope.name); return <div className="flex items-center gap-2 rounded-2xl bg-secondary/65 p-3"><WorldIcon world={world} className="size-12 rounded-full" /><div className="min-w-0 flex-1"><p className="font-black">{world.name}</p><p className="truncate text-xs text-muted-foreground">{names.join("، ") || `${occurrence.selectedScopeIds.length} نطاقات`}</p></div><button type="button" onClick={() => onEdit(world, occurrence.occurrenceIndex)} aria-label={`تعديل ${world.name}`} className="rounded-full p-2 hover:bg-card"><Edit3 className="size-4" /></button><button type="button" onClick={() => onRemove(occurrence.occurrenceIndex)} aria-label={`إزالة ${world.name}`} className="rounded-full p-2 hover:bg-card hover:text-destructive"><Trash2 className="size-4" /></button></div>; }

function WorldScopesDialog({ state, selectedScopeIds, onSelectedScopeIdsChange, onClose, onConfirm }: { state?: { world: PlayableWorld; occurrenceIndex: number }; selectedScopeIds: string[]; onSelectedScopeIdsChange: (ids: string[]) => void; onClose: () => void; onConfirm: () => void }) {
  const query = usePlayableScopes(state?.world.id);
  const scopes = useMemo(() => (query.data ?? []).filter(isSelectableScope).slice().sort((a, b) => a.sortOrder - b.sortOrder), [query.data]);
  const toggle = (scope: PlayableScope) => onSelectedScopeIdsChange(selectedScopeIds.includes(scope.id) ? selectedScopeIds.filter((id) => id !== scope.id) : selectedScopeIds.length < SCOPES_PER_OCCURRENCE ? [...selectedScopeIds, scope.id] : selectedScopeIds);
  return <Dialog open={Boolean(state)} onOpenChange={(open: boolean) => !open && onClose()}><DialogContent showCloseButton={false} className="max-h-[85vh] w-[min(1040px,90vw)] max-w-none overflow-hidden rounded-[1.5rem] border-primary/10 bg-card p-0 shadow-[0_30px_100px_rgba(15,12,38,.3)] sm:max-w-none">{state && <><DialogHeader className="flex-row items-center gap-4 border-b px-5 py-4 text-right sm:px-8"><span className="relative size-20 shrink-0 overflow-hidden rounded-full border border-border bg-secondary shadow-[0_8px_22px_rgba(24,16,54,.1)]"><WorldCover world={state.world} sizes="80px" /></span><div className="min-w-0 flex-1"><DialogTitle className="text-xl font-black leading-tight sm:text-2xl">عالم {state.world.name}</DialogTitle><DialogDescription className="mt-1.5 text-sm">اختر النطاقات اللي تبغاها في المباراة</DialogDescription></div><DialogClose asChild><button type="button" aria-label="إغلاق" className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"><X className="size-5" /></button></DialogClose></DialogHeader><div className="overflow-y-auto px-5 py-5 sm:px-8"><div className="mb-4 flex items-center justify-between"><p className="text-base font-black">النطاقات المتاحة</p><span data-testid="scope-count" className="akwaan-numeral rounded-full border border-border bg-secondary/65 px-2.5 py-1 text-xs font-black text-muted-foreground">{selectedScopeIds.length} / {SCOPES_PER_OCCURRENCE}</span></div>{query.isLoading ? <CardSkeletons count={4} /> : query.isError ? <JourneyError title="تعذر تحميل النطاقات" description="تحقّق من اتصالك ثم حاول مرة أخرى." onRetry={() => void query.refetch()} retrying={query.isFetching} /> : <ul className="grid list-none gap-4 sm:grid-cols-2">{scopes.map((scope) => { const selected = selectedScopeIds.includes(scope.id); return <li key={scope.id}><button type="button" aria-pressed={selected} disabled={selectedScopeIds.length >= SCOPES_PER_OCCURRENCE && !selected} onClick={() => toggle(scope)} className={cn("group flex h-[190px] w-full flex-col overflow-hidden rounded-[1.25rem] border bg-card text-right shadow-[0_8px_24px_rgba(24,16,54,.05)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40", selected ? "border-[hsl(var(--brand-gold))] bg-[hsl(var(--brand-gold)/.06)] shadow-[0_10px_28px_hsl(var(--brand-gold)/.12)]" : "border-border hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(24,16,54,.09)]")}><ScopeCardMedia scope={scope} className="h-[130px] sm:h-[130px]">{selected && <span className="absolute left-3 top-3 grid size-7 place-items-center rounded-full bg-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))] shadow-sm"><Check className="size-4" /></span>}</ScopeCardMedia><span className="flex flex-1 items-center px-5 text-lg font-black">{scope.name}</span></button></li>; })}</ul>}</div><DialogFooter className="m-0 flex-row items-center justify-between rounded-none border-t bg-card px-5 py-4 sm:px-8"><DialogClose asChild><Button variant="ghost" className="rounded-full px-6 font-black text-muted-foreground">إلغاء</Button></DialogClose><Button onClick={onConfirm} disabled={selectedScopeIds.length !== SCOPES_PER_OCCURRENCE} className="min-w-44 rounded-full bg-[hsl(var(--brand-navy))] font-black text-white hover:bg-[hsl(var(--brand-navy)/.9)] disabled:bg-[hsl(var(--brand-navy)/.1)] disabled:text-[hsl(var(--brand-navy)/.42)] disabled:opacity-100">تأكيد الاختيار</Button></DialogFooter></>}</DialogContent></Dialog>;
}

export function CardSkeletons({ count }: { count: number; className?: string; columns?: "featured" | "grid" }) { return <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">{Array.from({ length: count }, (_, index) => <div key={index} className="aspect-square animate-pulse rounded-full border bg-card" />)}</div>; }
export function EmptyWorlds({ isAuthenticated: _isAuthenticated }: { isAuthenticated?: boolean }) { return <div className="rounded-3xl border bg-card p-10 text-center"><p className="text-lg font-black">لا توجد عوالم متاحة بعد</p><p className="mt-2 text-sm text-muted-foreground">سيظهر هنا كل عالم فور تفعيله.</p></div>; }
