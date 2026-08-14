"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "../providers/auth-provider";
import {
  requestOtp,
  toOtpError,
  type OtpChannel,
  type OtpError,
} from "../api/otp-api";
import { OTP_LENGTH, OtpCodeInput } from "./otp-code-input";

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

  const send = useCallback(
    async (target: string) => {
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
    },
    [],
  );

  const verify = useCallback(
    async (entered: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await loginWithOtp(identifier, entered);
        // Same destination the password flow used, so nothing downstream of
        // login had to change.
        router.push(result.user.role === "admin" ? "/admin" : "/");
      } catch (cause) {
        const otpError = toOtpError(cause);
        setError(otpError);
        setCode("");
      } finally {
        setBusy(false);
      }
    },
    [identifier, loginWithOtp, router],
  );

  const smsUnavailable = error?.code === "SMS_OTP_NOT_AVAILABLE";
  const attemptsExhausted = error?.code === "OTP_TOO_MANY_ATTEMPTS";
  const expired =
    error?.code === "OTP_EXPIRED" || error?.code === "OTP_INVALID_OR_EXPIRED";

  return (
    <Card className="mx-auto w-full max-w-md" dir="rtl">
      <CardHeader>
        <CardTitle className="text-center text-2xl">تسجيل الدخول</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {step === "identifier" ? (
          <>
            <div
              className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
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
                    "rounded-lg py-2 text-sm font-medium transition",
                    channel === value
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void send(identifier);
              }}
            >
              {channel === "email" ? (
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  dir="ltr"
                  placeholder="name@example.com"
                  aria-label="البريد الإلكتروني"
                  data-testid="otp-email-input"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                />
              ) : (
                <div className="flex items-center gap-2" dir="ltr">
                  {/* Saudi numbers are the only supported format, so the
                      country code is shown rather than asked for. */}
                  <span className="rounded-lg border bg-muted px-3 py-2 text-sm font-medium">
                    +966
                  </span>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    dir="ltr"
                    placeholder="5X XXX XXXX"
                    aria-label="رقم الجوال"
                    data-testid="otp-phone-input"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                  />
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
                className="w-full"
                disabled={busy || !identifier.trim()}
                data-testid="otp-request-button"
              >
                {busy ? "جارٍ الإرسال…" : "إرسال رمز التحقق"}
              </Button>
            </form>
          </>
        ) : (
          <div className="space-y-5">
            <p className="text-center text-sm text-muted-foreground">
              أدخل الرمز المرسل إلى{" "}
              <span dir="ltr" className="font-medium text-foreground">
                {identifier}
              </span>
            </p>

            <OtpCodeInput
              value={code}
              onChange={setCode}
              onComplete={(entered) => void verify(entered)}
              disabled={busy || attemptsExhausted}
              invalid={Boolean(error)}
            />

            {error && (
              <p
                role="alert"
                data-testid="otp-error"
                className="text-center text-sm text-destructive"
              >
                {error.message}
                {typeof error.remainingAttempts === "number" &&
                  error.remainingAttempts > 0 && (
                    <span className="block text-muted-foreground">
                      المحاولات المتبقية: {error.remainingAttempts}
                    </span>
                  )}
              </p>
            )}

            <Button
              type="button"
              className="w-full"
              disabled={busy || code.length < OTP_LENGTH || attemptsExhausted}
              onClick={() => void verify(code)}
              data-testid="otp-verify-button"
            >
              {busy ? "جارٍ التحقق…" : "تأكيد"}
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                className="text-muted-foreground underline"
                data-testid="otp-change-identifier"
                onClick={() => {
                  setStep("identifier");
                  setError(null);
                  setCode("");
                }}
              >
                تغيير {channel === "email" ? "البريد" : "الرقم"}
              </button>

              {cooldown > 0 ? (
                <span
                  className="text-muted-foreground"
                  data-testid="otp-cooldown"
                >
                  إعادة الإرسال بعد {cooldown} ثانية
                </span>
              ) : (
                <button
                  type="button"
                  className="font-medium text-primary underline"
                  data-testid="otp-resend-button"
                  disabled={busy}
                  onClick={() => void send(identifier)}
                >
                  {expired || attemptsExhausted
                    ? "إرسال رمز جديد"
                    : "إعادة الإرسال"}
                </button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
