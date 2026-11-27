"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { normalizeDigits } from "@/lib/normalize-digits";
import { useAuth } from "../providers/auth-provider";
import {
  requestOtp,
  toOtpError,
  type OtpChannel,
  type OtpError,
} from "../api/otp-api";
import { OTP_LENGTH, OtpCodeInput } from "./otp-code-input";
import { consumePostAuthDestination } from "../navigation/post-auth-destination";

type Step = "identifier" | "code";

/**
 * Passwordless login: choose a channel, receive a code, enter it.
 *
 * No password field, and no OTP logic — the client never generates, validates,
 * or ages a code. It sends an identifier, renders whatever the server says, and
 * exchanges six digits for the same session the rest of the app already uses.
 */
/**
 * Whether a player may sign in with a phone number.
 *
 * Off until SMS delivery is live: the tab asked for a number and then sent
 * nothing, so somebody sat waiting for a code that was never coming. The
 * phone path itself is untouched — flip this and it is back.
 */
export const PHONE_LOGIN_ENABLED = false;

export function PasswordlessLoginForm({
  allowPhone = PHONE_LOGIN_ENABLED,
}: {
  allowPhone?: boolean;
} = {}) {
  const router = useRouter();
  const { loginWithOtp } = useAuth();

  const [channel, setChannel] = useState<OtpChannel>("email");
  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<OtpError | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((left) => left - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const switchChannel = (next: OtpChannel) => {
    setChannel(next);
    setError(null);
    setIdentifier("");
  };

  const send = useCallback(async (target: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await requestOtp(target);
      setStep("code");
      setCode("");
      setCooldown(result.resendAvailableInSeconds);
    } catch (cause) {
      const otpError = toOtpError(cause);
      setError(otpError);
      if (otpError.retryAfterSeconds) setCooldown(otpError.retryAfterSeconds);
    } finally {
      setBusy(false);
    }
  }, []);

  const verify = useCallback(
    async (entered: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await loginWithOtp(identifier, entered);
        router.push(
          result.user.role === "admin"
            ? "/admin"
            : consumePostAuthDestination("/"),
        );
      } catch (cause) {
        const otpError = toOtpError(cause);
        setError(otpError);
        setCode("");
        // A throttle is a pause, not a lockout — the code stays valid. Showing
        // the server's retry delay is the only honest thing to display, since
        // there is no attempt allowance to count down any more.
        if (otpError.retryAfterSeconds) setCooldown(otpError.retryAfterSeconds);
      } finally {
        setBusy(false);
      }
    },
    [identifier, loginWithOtp, router],
  );

  const smsUnavailable = error?.code === "SMS_OTP_NOT_AVAILABLE";
  const expired =
    error?.code === "OTP_EXPIRED" || error?.code === "OTP_INVALID_OR_EXPIRED";

  return (
    <Card
      className="w-full max-w-[480px] rounded-[28px] border-[3px] border-brand-navy bg-brand-paper shadow-[7px_8px_0_hsl(var(--brand-navy))]"
      dir="rtl"
    >
      <CardHeader className="space-y-2 px-6 pb-[22px] pt-7 text-start sm:px-9 sm:pt-9">
        <CardTitle className="font-display text-[30px] font-black leading-[1.4] text-brand-navy sm:text-[40px]">
          {step === "identifier" ? "ياهلا فيك، نورت أكوان" : "أرسلنا لك الرمز"}
        </CardTitle>
        <CardDescription className="text-base leading-[1.8] text-brand-slate sm:text-lg">
          {step === "identifier"
            ? "سجّل دخولك وكمل لعبك من حيث وقفت."
            : channel === "email"
              ? "دخل رمز الدخول اللي وصلك على بريدك."
              : "دخل رمز الدخول اللي وصلك على جوالك."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-[22px] px-6 pb-7 sm:px-9 sm:pb-9">
        {step === "identifier" ? (
          <div className="akwaan-rise space-y-6">
            {allowPhone && (
              <div
                className="grid grid-cols-2 gap-1 rounded-full border-[3px] border-brand-navy bg-white p-1"
                role="tablist"
                aria-label="طريقة تسجيل الدخول"
              >
                {(
                  [
                    ["email", "البريد الإلكتروني"],
                    ["phone", "رقم الجوال"],
                  ] as Array<[OtpChannel, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={channel === value}
                    onClick={() => switchChannel(value)}
                    data-testid={`otp-channel-${value}`}
                    className={[
                      "min-h-11 rounded-full px-2 text-[15px] font-bold text-brand-navy transition-colors",
                      channel === value
                        ? "bg-brand-gold"
                        : "text-brand-slate hover:bg-brand-lavender",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                void send(identifier);
              }}
            >
              {channel === "email" ? (
                <div className="space-y-2">
                  <label
                    htmlFor="otp-email"
                    className="block text-base font-bold text-brand-navy"
                  >
                    البريد الإلكتروني
                  </label>
                  <Input
                    id="otp-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    dir="ltr"
                    lang="en"
                    placeholder="name@example.com"
                    aria-label="البريد الإلكتروني"
                    data-testid="otp-email-input"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    className="h-[58px] rounded-2xl border-[3px] border-brand-navy bg-white px-[18px] text-lg text-brand-navy shadow-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--brand-purple))] focus-visible:ring-offset-0"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <label
                    htmlFor="otp-phone"
                    className="block text-base font-bold text-brand-navy"
                  >
                    رقم الجوال
                  </label>
                  <div className="flex items-center gap-2" dir="ltr">
                    {/* Saudi numbers are the only supported format, so the
                        country code is shown rather than asked for. */}
                    <span className="grid h-[56px] place-items-center rounded-[14px] border-[3px] border-brand-navy bg-brand-lavender px-3.5 text-base font-bold text-brand-navy">
                      +966
                    </span>
                    <Input
                      id="otp-phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      dir="ltr"
                      lang="en"
                      placeholder="5XXXXXXXX"
                      aria-label="رقم الجوال"
                      data-testid="otp-phone-input"
                      value={identifier}
                      onChange={(event) =>
                        setIdentifier(normalizeDigits(event.target.value))
                      }
                      className="h-[58px] rounded-2xl border-[3px] border-brand-navy bg-white px-[18px] text-lg text-brand-navy shadow-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--brand-purple))] focus-visible:ring-offset-0"
                    />
                  </div>
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  data-testid="otp-error"
                  className="rounded-xl border-2 border-brand-navy bg-brand-lavender px-3 py-2 text-sm font-semibold text-brand-navy"
                >
                  {error.message}
                </p>
              )}

              {smsUnavailable && (
                // States what is true now and offers the way forward. No
                // "coming soon": the repo bans placeholder promises for
                // capabilities that are either available or not.
                <p className="text-sm text-muted-foreground">
                  استخدم البريد الإلكتروني لتسجيل الدخول.
                </p>
              )}

              <Button
                type="submit"
                className="h-auto min-h-16 w-full rounded-full border-[3px] border-brand-navy bg-brand-gold font-display text-[21px] font-extrabold text-brand-navy shadow-[5px_6px_0_hsl(var(--brand-navy))] hover:bg-brand-gold disabled:cursor-not-allowed disabled:opacity-100"
                disabled={busy || !identifier.trim()}
                aria-busy={busy}
                data-testid="otp-request-button"
              >
                {busy ? "نرسل الرمز…" : "أرسل رمز الدخول"}
              </Button>
            </form>
          </div>
        ) : (
          <div className="akwaan-rise space-y-6">
            <OtpCodeInput
              value={code}
              onChange={setCode}
              onComplete={(entered) => void verify(entered)}
              disabled={busy}
              invalid={Boolean(error)}
            />

            {error && (
              <p
                role="alert"
                data-testid="otp-error"
                className="text-center text-sm text-foreground"
              >
                {error.message}
              </p>
            )}

            <Button
              type="button"
              className="h-auto min-h-16 w-full rounded-full border-[3px] border-brand-navy bg-brand-gold font-display text-[21px] font-extrabold text-brand-navy shadow-[5px_6px_0_hsl(var(--brand-navy))] hover:bg-brand-gold disabled:cursor-not-allowed disabled:opacity-100"
              disabled={busy || code.length < OTP_LENGTH}
              aria-busy={busy}
              onClick={() => void verify(code)}
              data-testid="otp-verify-button"
            >
              {busy ? "نتأكد…" : "تأكيد"}
            </Button>

            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-center gap-2 text-[hsl(var(--brand-navy)/.58)]">
                <span>ما وصلك الرمز؟</span>
                {cooldown > 0 ? (
                  <span data-testid="otp-cooldown">
                    أرسل مرة ثانية بعد {cooldown} ثانية
                  </span>
                ) : (
                  <button
                    type="button"
                    className="font-semibold text-[hsl(var(--brand-navy))] underline decoration-[hsl(var(--brand-gold))] underline-offset-4 disabled:opacity-50"
                    data-testid="otp-resend-button"
                    disabled={busy}
                    onClick={() => void send(identifier)}
                  >
                    {expired ? "أرسل رمز جديد" : "أرسل مرة ثانية"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div
          className={
            step === "code"
              ? "flex w-full items-center justify-between gap-4"
              : "text-center"
          }
        >
          {step === "code" && (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--brand-navy)/.62)] transition-colors hover:text-[hsl(var(--brand-navy))] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold)/.45)]"
            >
              <ArrowRight className="size-3.5" aria-hidden />
              الرجوع للرئيسية
            </Link>
          )}
          {step === "code" ? (
            <button
              type="button"
              className="text-sm font-semibold text-[hsl(var(--brand-navy)/.56)] transition-colors hover:text-[hsl(var(--brand-navy))] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold)/.45)]"
              data-testid="otp-change-identifier"
              onClick={() => {
                setStep("identifier");
                setError(null);
                setCode("");
              }}
            >
              {channel === "email"
                ? "تغيير البريد الإلكتروني"
                : "تغيير رقم الجوال"}
            </button>
          ) : (
            <Link
              href="/"
              className="inline-flex min-h-11 w-fit items-center text-[15px] font-bold text-brand-navy underline-offset-4 transition-colors hover:text-brand-bronze focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-purple))]"
            >
              الرجوع للرئيسية
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
