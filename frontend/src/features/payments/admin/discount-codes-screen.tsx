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
import { useShopCatalogue } from "../api/shop";
import {
  useCreateDiscountCode,
  useDiscountCodes,
  useSetDiscountCodeActive,
} from "./discount-codes.api";
import {
  codeStatus,
  discountLabel,
  STATUS_LABEL,
  usageLabel,
} from "./code-status";

/**
 * Making and retiring discount codes.
 *
 * The list is the point, not the form: by the week after launch there will be
 * codes nobody remembers issuing, and the column that matters is what each one
 * is actually doing — a code can be switched on and still refuse everybody
 * because its date passed or its allocation is gone.
 */
export function DiscountCodesScreen() {
  const codes = useDiscountCodes();
  const setActive = useSetDiscountCodeActive();
  const now = new Date();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">أكواد الخصم</h1>

      <CreateCodeForm />

      {codes.isPending ? (
        <p className="text-muted-foreground">جاري التحميل…</p>
      ) : codes.isError ? (
        <p role="alert" className="text-destructive">
          ما قدرنا نجيب الأكواد. حدّث الصفحة.
        </p>
      ) : codes.data?.length === 0 ? (
        <p className="text-muted-foreground">
          ما فيه أكواد لين الحين. سوِّ واحد من فوق.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الكود</TableHead>
              <TableHead className="text-right">الخصم</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">الاستخدام</TableHead>
              <TableHead className="text-right">ينتهي</TableHead>
              <TableHead className="text-right">الباقات</TableHead>
              <TableHead className="text-right">ملاحظة</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.data?.map((code) => {
              const status = codeStatus(code, now);
              return (
                <TableRow key={code.code}>
                  <TableCell className="font-mono font-bold">
                    {code.code}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {discountLabel(code)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        status === "live"
                          ? "font-bold text-emerald-700"
                          : "text-muted-foreground"
                      }
                    >
                      {STATUS_LABEL[status]}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {usageLabel(code)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {code.expiresAt
                      ? new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
                          dateStyle: "medium",
                          timeZone: "Asia/Riyadh",
                        }).format(new Date(code.expiresAt))
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {code.packIds.length ? code.packIds.join("، ") : "الكل"}
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">
                    {code.note ?? "—"}
                  </TableCell>
                  <TableCell>
                    {/* Switched off, never deleted: the purchases that used it
                        name it, and a code that vanishes takes the explanation
                        of those sales with it. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={setActive.isPending}
                      onClick={() =>
                        setActive.mutate({
                          code: code.code,
                          active: !code.active,
                        })
                      }
                    >
                      {code.active ? "إيقاف" : "تشغيل"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function CreateCodeForm() {
  const create = useCreateDiscountCode();
  const { data: catalogue } = useShopCatalogue();
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [packIds, setPackIds] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const amount = Number(value);
  // The server refuses both and neither; the form should not be able to send
  // either case in the first place.
  const valid =
    code.trim().length >= 3 &&
    Number.isFinite(amount) &&
    amount >= 1 &&
    (kind === "percent" ? amount <= 100 : true);

  const submit = () => {
    if (!valid) return;
    create.mutate(
      {
        code: code.trim(),
        ...(kind === "percent"
          ? { percentOff: Math.round(amount) }
          : { amountOffHalalas: Math.round(amount * 100) }),
        ...(packIds.length ? { packIds } : {}),
        ...(maxRedemptions ? { maxRedemptions: Number(maxRedemptions) } : {}),
        // A date with no time means the end of that day in Riyadh, which is
        // what someone typing "31 December" means by it.
        ...(expiresAt
          ? { expiresAt: new Date(`${expiresAt}T23:59:59+03:00`).toISOString() }
          : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      {
        onSuccess: () => {
          setCode("");
          setValue("");
          setMaxRedemptions("");
          setExpiresAt("");
          setPackIds([]);
          setNote("");
        },
      },
    );
  };

  return (
    <form
      className="space-y-4 rounded-xl border p-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h2 className="text-lg font-bold">كود جديد</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5">
          <span className="text-sm font-semibold">الكود</span>
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="AKWAAN20"
            maxLength={32}
            className="font-mono"
          />
          <span className="block text-xs text-muted-foreground">
            حروف وأرقام و - و _ فقط
          </span>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-semibold">نوع الخصم</span>
          <select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as "percent" | "amount")
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="percent">نسبة %</option>
            <option value="amount">مبلغ بالريال</option>
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-semibold">
            {kind === "percent" ? "النسبة" : "المبلغ"}
          </span>
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            inputMode="decimal"
            placeholder={kind === "percent" ? "20" : "10"}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-semibold">سقف الاستخدام</span>
          <Input
            value={maxRedemptions}
            onChange={(event) => setMaxRedemptions(event.target.value)}
            inputMode="numeric"
            placeholder="بلا حدود"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-semibold">ينتهي في</span>
          <Input
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </label>

        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-sm font-semibold">ملاحظة</span>
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="مثال: حملة انستقرام — حساب فلان"
            maxLength={200}
          />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">
          الباقات — اتركها فاضية عشان يشتغل على الكل
        </legend>
        <div className="flex flex-wrap gap-2">
          {catalogue?.packs.map((pack) => {
            const chosen = packIds.includes(pack.id);
            return (
              <button
                key={pack.id}
                type="button"
                aria-pressed={chosen}
                onClick={() =>
                  setPackIds((current) =>
                    chosen
                      ? current.filter((id) => id !== pack.id)
                      : [...current, pack.id],
                  )
                }
                className={
                  chosen
                    ? "rounded-full border-2 border-primary bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground"
                    : "rounded-full border-2 border-input px-4 py-1.5 text-sm font-semibold text-muted-foreground hover:border-primary/50"
                }
              >
                {pack.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!valid || create.isPending}>
          {create.isPending ? "جاري الحفظ…" : "سوِّ الكود"}
        </Button>
        {create.isError ? (
          <span role="alert" className="text-sm text-destructive">
            ما انحفظ — يمكن الكود موجود من قبل.
          </span>
        ) : create.isSuccess ? (
          <span role="status" className="text-sm text-emerald-700">
            تم.
          </span>
        ) : null}
      </div>
    </form>
  );
}
