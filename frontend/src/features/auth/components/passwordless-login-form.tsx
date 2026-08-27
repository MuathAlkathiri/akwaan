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
export function PasswordlessLoginForm() {
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
      className="mx-auto w-full max-w-[510px] rounded-[28px] border-[hsl(var(--brand-navy)/.085)] bg-white shadow-[0_24px_70px_-38px_hsl(var(--brand-navy)/.35)] ring-1 ring-[hsl(var(--brand-gold)/.055)]"
      dir="rtl"
    >
      <CardHeader className="space-y-3 px-6 pb-5 pt-7 text-center sm:px-10 sm:pt-10">
        <CardTitle className="font-display text-2xl font-bold leading-relaxed text-[hsl(var(--brand-navy))] sm:text-[28px]">
          {step === "identifier" ? "ياهلا فيك، نورت أكوان" : "أرسلنا لك الرمز"}
        </CardTitle>
        <CardDescription className="text-[15px] leading-7 text-[hsl(var(--brand-navy)/.58)]">
          {step === "identifier"
            ? "سجّل دخولك وكمل لعبك من حيث وقفت."
            : channel === "email"
              ? "دخل رمز الدخول اللي وصلك على بريدك."
              : "دخل رمز الدخول اللي وصلك على جوالك."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-6 pb-7 sm:px-10 sm:pb-10">
        {step === "identifier" ? (
          <div className="akwaan-rise space-y-6">
            <div
              className="grid grid-cols-2 gap-1 rounded-2xl bg-[hsl(var(--brand-navy)/.045)] p-1.5"
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
                    "relative rounded-xl px-2 py-3 text-sm font-semibold transition-all",
                    channel === value
                      ? "bg-white text-[hsl(var(--brand-navy))] shadow-[0_5px_16px_-12px_hsl(var(--brand-navy)/.45)] after:absolute after:bottom-1 after:left-1/2 after:h-0.5 after:w-5 after:-translate-x-1/2 after:rounded-full after:bg-[hsl(var(--brand-gold))]"
                      : "text-[hsl(var(--brand-navy)/.48)] hover:text-[hsl(var(--brand-navy)/.72)]",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>

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
                    className="block text-sm font-semibold text-[hsl(var(--brand-navy)/.82)]"
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
                    className="h-[52px] rounded-xl border-[hsl(var(--brand-navy)/.14)] bg-white px-4 text-base text-[hsl(var(--brand-navy))] shadow-none focus-visible:border-[hsl(var(--brand-navy)/.55)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold)/.28)] focus-visible:ring-offset-0"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <label
                    htmlFor="otp-phone"
                    className="block text-sm font-semibold text-[hsl(var(--brand-navy)/.82)]"
                  >
                    رقم الجوال
                  </label>
                  <div className="flex items-center gap-2" dir="ltr">
                    {/* Saudi numbers are the only supported format, so the
                        country code is shown rather than asked for. */}
                    <span className="grid h-[52px] place-items-center rounded-xl border border-[hsl(var(--brand-navy)/.12)] bg-[hsl(var(--brand-navy)/.035)] px-3 text-sm font-semibold text-[hsl(var(--brand-navy)/.7)]">
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
                      className="h-[52px] rounded-xl border-[hsl(var(--brand-navy)/.14)] bg-white px-4 text-base text-[hsl(var(--brand-navy))] shadow-none focus-visible:border-[hsl(var(--brand-navy)/.55)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold)/.28)] focus-visible:ring-offset-0"
                    />
                  </div>
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  data-testid="otp-error"
                  className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
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
                className="h-[52px] w-full rounded-xl bg-[hsl(var(--brand-navy))] text-base font-bold text-white shadow-[0_14px_28px_-18px_hsl(var(--brand-navy)/.75)] hover:bg-[hsl(var(--brand-navy)/.93)] disabled:bg-[hsl(var(--brand-navy)/.2)] disabled:text-white/90"
                disabled={busy || !identifier.trim()}
                data-testid="otp-request-button"
              >
                {busy ? "جارٍ الإرسال…" : "أرسل رمز الدخول"}
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
                className="text-center text-sm text-destructive"
              >
                {error.message}
              </p>
            )}

            <Button
              type="button"
              className="h-[52px] w-full rounded-xl bg-[hsl(var(--brand-navy))] text-base font-bold text-white shadow-[0_14px_28px_-18px_hsl(var(--brand-navy)/.75)] hover:bg-[hsl(var(--brand-navy)/.93)] disabled:bg-[hsl(var(--brand-navy)/.2)]"
              disabled={busy || code.length < OTP_LENGTH}
              onClick={() => void verify(code)}
              data-testid="otp-verify-button"
            >
              {busy ? "جارٍ التحقق…" : "تأكيد"}
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
              className="inline-block w-fit text-sm font-semibold text-[hsl(var(--brand-navy)/.56)] decoration-[hsl(var(--brand-gold)/.65)] underline-offset-4 transition-colors hover:text-[hsl(var(--brand-navy))] hover:underline focus-visible:rounded-sm focus-visible:text-[hsl(var(--brand-navy))] focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold)/.45)]"
            >
              الرجوع للرئيسية
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
