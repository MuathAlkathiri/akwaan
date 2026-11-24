"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApiErrorMessage } from "@/lib/utils";
import {
  useCampaignSettings,
  useCreateGiftCode,
  useGiftCodes,
  useGrantMatches,
  useLookupAccount,
  useSetGiftCodeActive,
  useSetWeeklyLimit,
  type AccountLedger,
} from "./matches-admin.api";

const CARD = "space-y-4 rounded-2xl border-2 border-brand-navy bg-white p-5";
const LABEL = "mb-1.5 block text-sm font-bold";
const HELP = "mt-1 text-xs text-muted-foreground";

/** Why a balance moved, in the words of the person reading the list. */
const REASON: Record<string, string> = {
  "admin.grant": "إضافة يدوية",
  "gift-code": "كود هدية",
  purchase: "شراء",
  "match.start": "بدء مباراة",
  "match.refund": "إرجاع مباراة",
  "campaign.launch-month": "حملة الإطلاق (قديم)",
};

/**
 * Matches, by hand.
 *
 * Three jobs the launch month needs somebody to do without a deploy: put
 * Matches on an account that asked for more, change how many are free each
 * week, and issue a code that gives Matches to whoever types it.
 */
export function MatchesAdminScreen() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">المباريات والحملة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          أضف مباريات لحساب، غيّر العدد المجاني الأسبوعي، وسوِّ أكواد هدايا.
        </p>
      </div>
      <GrantCard />
      <WeeklyLimitCard />
      <GiftCodesCard />
    </div>
  );
}

function GrantCard() {
  const lookup = useLookupAccount();
  const grant = useGrantMatches();
  const [email, setEmail] = useState("");
  const [account, setAccount] = useState<AccountLedger>();
  const [amount, setAmount] = useState("3");
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string>();
  // One key per form fill: a double click adds once, a new grant adds again.
  const [key, setKey] = useState(() => crypto.randomUUID());

  const find = () => {
    const wanted = email.trim();
    if (!wanted) return;
    setDone(undefined);
    setAccount(undefined);
    lookup.mutate(wanted, { onSuccess: setAccount });
  };

  const count = Number(amount);
  const valid =
    account && Number.isInteger(count) && count >= 1 && count <= 500 && note.trim();

  return (
    <section className={CARD} data-testid="admin-grant-matches">
      <h2 className="text-xl font-bold">أضف مباريات لحساب</h2>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          find();
        }}
      >
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="grant-email" className={LABEL}>
            إيميل الحساب
          </label>
          <Input
            id="grant-email"
            type="email"
            dir="ltr"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
          />
        </div>
        <Button type="submit" disabled={!email.trim() || lookup.isPending}>
          {lookup.isPending ? "ندوّر…" : "دوّر"}
        </Button>
      </form>
      {lookup.isError ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {getApiErrorMessage(lookup.error, "ما قدرنا ندوّر على الحساب.")}
        </p>
      ) : null}

      {account ? (
        <div className="space-y-4 rounded-xl border-2 border-dashed border-brand-dash bg-brand-lavender p-4">
          <p className="text-sm">
            <b dir="ltr">{account.email}</b> · رصيده الحين{" "}
            <b className="akwaan-numeral">{account.balance}</b>
            {account.weekly ? (
              <>
                {" "}
                · المجانية هالأسبوع{" "}
                <b className="akwaan-numeral">
                  {account.weekly.remaining}/{account.weekly.limit}
                </b>
              </>
            ) : null}
          </p>
          <form
            className="grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (!valid || !account) return;
              grant.mutate(
                {
                  accountId: account.accountId,
                  amount: count,
                  note: note.trim(),
                  idempotencyKey: key,
                },
                {
                  onSuccess: (result) => {
                    setDone(
                      `انضافت ${count}. رصيده صار ${result.balance}.`,
                    );
                    setAccount({ ...account, balance: result.balance });
                    setNote("");
                    setKey(crypto.randomUUID());
                  },
                },
              );
            }}
          >
            <div>
              <label htmlFor="grant-amount" className={LABEL}>
                كم مباراة
              </label>
              <Input
                id="grant-amount"
                type="number"
                min={1}
                max={500}
                dir="ltr"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="grant-note" className={LABEL}>
                السبب
              </label>
              <Input
                id="grant-note"
                value={note}
                maxLength={280}
                onChange={(event) => setNote(event.target.value)}
                placeholder="طلب من زر «كلمنا»، تعويض عن خلل…"
              />
            </div>
            <Button type="submit" disabled={!valid || grant.isPending}>
              {grant.isPending ? "نضيف…" : "أضف"}
            </Button>
          </form>
          <p className={HELP}>
            تنضاف لرصيده العادي: تنسحب بعد ما تخلص المجانية، وتبقى معه بعد
            نهاية الحملة. العملية تتسجل باسمك مع السبب.
          </p>
          {done ? (
            <p role="status" className="text-sm font-bold text-brand-navy">
              {done}
            </p>
          ) : null}
          {grant.isError ? (
            <p role="alert" className="text-sm font-bold text-destructive">
              {getApiErrorMessage(grant.error, "ما قدرنا نضيف المباريات.")}
            </p>
          ) : null}

          {account.movements.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-sm font-bold">
                آخر الحركات على رصيده
              </summary>
              <ul className="mt-2 space-y-1 text-sm">
                {account.movements.map((movement, index) => (
                  <li key={index} className="flex flex-wrap gap-x-3">
                    <b className="akwaan-numeral" dir="ltr">
                      {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                    </b>
                    <span>{REASON[movement.reason] ?? movement.reason}</span>
                    {movement.reference ? (
                      <span className="text-muted-foreground" dir="auto">
                        {movement.reference}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function WeeklyLimitCard() {
  const settings = useCampaignSettings();
  const save = useSetWeeklyLimit();
  const [value, setValue] = useState<string>();
  const current = settings.data?.weeklyFreeMatches;
  const shown = value ?? (current === undefined ? "" : String(current));
  const next = Number(shown);
  const valid = shown !== "" && Number.isInteger(next) && next >= 0 && next <= 10;

  return (
    <section className={CARD} data-testid="admin-weekly-limit">
      <h2 className="text-xl font-bold">المباريات المجانية في الأسبوع</h2>
      {settings.isPending ? (
        <p className="text-muted-foreground">جاري التحميل…</p>
      ) : settings.isError ? (
        <p role="alert" className="text-destructive">
          ما قدرنا نجيب إعدادات الحملة. حدّث الصفحة.
        </p>
      ) : (
        <>
          <p className="text-sm">
            الحملة{" "}
            <b>{settings.data.open ? "شغالة" : "منتهية"}</b>
            {" · "}
            الشراء <b>{settings.data.salesOpen ? "مفتوح" : "مقفل"}</b>
          </p>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!valid) return;
              save.mutate(next, { onSuccess: () => setValue(undefined) });
            }}
          >
            <div className="w-32">
              <label htmlFor="weekly-limit" className={LABEL}>
                العدد لكل حساب
              </label>
              <Input
                id="weekly-limit"
                type="number"
                min={0}
                max={10}
                dir="ltr"
                value={shown}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={!valid || next === current || save.isPending}
            >
              {save.isPending ? "نحفظ…" : "احفظ"}
            </Button>
          </form>
          <p className={HELP}>
            يتغير على طول بدون نشر. نزّله لـ2 لو المحتوى ينحرق، أو ارفعه لـ4 لو
            كثر الطلب. يتجدد كل خميس وما يتجمع.
          </p>
          {save.isError ? (
            <p role="alert" className="text-sm font-bold text-destructive">
              {getApiErrorMessage(save.error, "ما انحفظ. جرّب مرة ثانية.")}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function GiftCodesCard() {
  const codes = useGiftCodes();
  const create = useCreateGiftCode();
  const setActive = useSetGiftCodeActive();
  const [code, setCode] = useState("");
  const [tokens, setTokens] = useState("2");
  const [uses, setUses] = useState("50");
  const [note, setNote] = useState("");

  const perAccount = Number(tokens);
  const cap = Number(uses);
  const valid =
    /^[A-Za-z0-9_-]{3,32}$/.test(code.trim()) &&
    Number.isInteger(perAccount) &&
    perAccount >= 1 &&
    perAccount <= 50 &&
    Number.isInteger(cap) &&
    cap >= 1;

  return (
    <section className={CARD} data-testid="admin-gift-codes">
      <h2 className="text-xl font-bold">أكواد الهدايا</h2>
      <p className="text-sm text-muted-foreground">
        الكود يعطي مباريات لرصيد اللي يدخله، مرة وحدة لكل حساب. غير أكواد
        الخصم: هذي ما لها علاقة بالشراء.
      </p>
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_8rem_8rem_1fr_auto] lg:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          create.mutate(
            {
              code: code.trim(),
              tokens: perAccount,
              maxRedemptions: cap,
              ...(note.trim() ? { note: note.trim() } : {}),
            },
            {
              onSuccess: () => {
                setCode("");
                setNote("");
              },
            },
          );
        }}
      >
        <div>
          <label htmlFor="gift-new-code" className={LABEL}>
            الكود
          </label>
          <Input
            id="gift-new-code"
            dir="ltr"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="FEEDBACK"
          />
        </div>
        <div>
          <label htmlFor="gift-new-tokens" className={LABEL}>
            مباريات لكل حساب
          </label>
          <Input
            id="gift-new-tokens"
            type="number"
            min={1}
            max={50}
            dir="ltr"
            value={tokens}
            onChange={(event) => setTokens(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="gift-new-uses" className={LABEL}>
            عدد الاستخدامات
          </label>
          <Input
            id="gift-new-uses"
            type="number"
            min={1}
            dir="ltr"
            value={uses}
            onChange={(event) => setUses(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="gift-new-note" className={LABEL}>
            ملاحظة (اختياري)
          </label>
          <Input
            id="gift-new-note"
            value={note}
            maxLength={280}
            onChange={(event) => setNote(event.target.value)}
            placeholder="كود الفيدباك"
          />
        </div>
        <Button type="submit" disabled={!valid || create.isPending}>
          {create.isPending ? "نسوّيه…" : "سوِّ الكود"}
        </Button>
      </form>
      {create.isError ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {getApiErrorMessage(create.error, "ما قدرنا نسوّي الكود.")}
        </p>
      ) : null}

      {codes.isPending ? (
        <p className="text-muted-foreground">جاري التحميل…</p>
      ) : codes.isError ? (
        <p role="alert" className="text-destructive">
          ما قدرنا نجيب الأكواد. حدّث الصفحة.
        </p>
      ) : codes.data.length === 0 ? (
        <p className="text-muted-foreground">ما فيه أكواد هدايا للحين.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الكود</TableHead>
              <TableHead className="text-right">المباريات</TableHead>
              <TableHead className="text-right">الاستخدام</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">ملاحظة</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.data.map((gift) => {
              const usedUp = gift.redemptionCount >= gift.maxRedemptions;
              return (
                <TableRow key={gift.code}>
                  <TableCell className="font-mono font-bold" dir="ltr">
                    {gift.code}
                  </TableCell>
                  <TableCell className="akwaan-numeral">{gift.tokens}</TableCell>
                  <TableCell className="akwaan-numeral">
                    {gift.redemptionCount} من {gift.maxRedemptions}
                  </TableCell>
                  <TableCell>
                    {!gift.active ? "موقوف" : usedUp ? "خلص" : "شغال"}
                  </TableCell>
                  <TableCell>{gift.note ?? "—"}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={setActive.isPending}
                      onClick={() =>
                        setActive.mutate({
                          code: gift.code,
                          active: !gift.active,
                        })
                      }
                    >
                      {gift.active ? "أوقفه" : "شغّله"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
