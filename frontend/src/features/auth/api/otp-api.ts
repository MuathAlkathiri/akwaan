import apiClient from "@/lib/api/client";
import type { AuthResponse } from "@/types";

export type OtpChannel = "email" | "phone";

export interface OtpRequestResult {
  status: "sent";
  channel: OtpChannel;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
}

export interface OtpVerifyResult extends AuthResponse {
  isNewUser: boolean;
}

/**
 * Every failure the OTP screens react to differently.
 *
 * The server is the authority on all of them — the client never decides that a
 * code expired or that attempts ran out, it only renders what came back.
 */
export type OtpErrorCode =
  | "IDENTIFIER_INVALID"
  | "OTP_INVALID"
  | "OTP_EXPIRED"
  | "OTP_INVALID_OR_EXPIRED"
  | "OTP_RESEND_COOLDOWN"
  | "OTP_RATE_LIMITED"
  | "SMS_OTP_NOT_AVAILABLE"
  | "EMAIL_OTP_NOT_CONFIGURED"
  | "OTP_DELIVERY_FAILED"
  | "UNKNOWN";

export interface OtpError {
  code: OtpErrorCode;
  message: string;
  retryAfterSeconds?: number;
}

const FALLBACK_MESSAGE = "حدث خطأ غير متوقع. حاول مرة أخرى.";

/** Normalizes an axios failure into the typed shape the screens switch on. */
export function toOtpError(cause: unknown): OtpError {
  const body = (
    cause as { response?: { data?: Record<string, unknown> } } | undefined
  )?.response?.data;
  const code = typeof body?.code === "string" ? body.code : "UNKNOWN";
  return {
    code: code as OtpErrorCode,
    message:
      typeof body?.message === "string" && body.message
        ? body.message
        : FALLBACK_MESSAGE,
    retryAfterSeconds:
      typeof body?.retryAfterSeconds === "number"
        ? body.retryAfterSeconds
        : undefined,
  };
}

export async function requestOtp(identifier: string) {
  const { data } = await apiClient.post<OtpRequestResult>("/auth/otp/request", {
    identifier,
  });
  return data;
}

export async function verifyOtp(identifier: string, code: string) {
  const { data } = await apiClient.post<OtpVerifyResult>("/auth/otp/verify", {
    identifier,
    code,
  });
  return data;
}
