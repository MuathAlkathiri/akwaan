import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordlessLoginForm } from "@/features/auth/components/passwordless-login-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const requestOtp = vi.fn();
const loginWithOtp = vi.fn();

vi.mock("@/features/auth/api/otp-api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/auth/api/otp-api")
  >("@/features/auth/api/otp-api");
  return { ...actual, requestOtp: (...args: never[]) => requestOtp(...args) };
});

vi.mock("@/features/auth/providers/auth-provider", () => ({
  useAuth: () => ({ loginWithOtp }),
}));

/** An axios-shaped rejection, which is what `toOtpError` reads. */
const apiError = (code: string, message: string, extra = {}) => ({
  response: { data: { code, message, ...extra } },
});

const sent = {
  status: "sent" as const,
  channel: "email" as const,
  expiresInSeconds: 300,
  resendAvailableInSeconds: 60,
};

describe("passwordless login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestOtp.mockResolvedValue(sent);
    loginWithOtp.mockResolvedValue({ user: { role: "user" } });
  });
  afterEach(() => vi.useRealTimers());

  it("requests a code for an email and moves to the code step", async () => {
    const user = userEvent.setup();
    render(<PasswordlessLoginForm />);

    await user.type(
      screen.getByTestId("otp-email-input"),
      "player@example.com",
    );
    await user.click(screen.getByTestId("otp-request-button"));

    expect(requestOtp).toHaveBeenCalledWith("player@example.com");
    await waitFor(() =>
      expect(screen.getByTestId("otp-digit-0")).toBeInTheDocument(),
    );
  });

  it("never sends a password field", async () => {
    render(<PasswordlessLoginForm />);
    // The screen has no password affordance at all — the flow replaced it.
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it("accepts six digits and verifies, then routes into the app", async () => {
    const user = userEvent.setup();
    render(<PasswordlessLoginForm />);
    await user.type(screen.getByTestId("otp-email-input"), "a@b.com");
    await user.click(screen.getByTestId("otp-request-button"));
    await waitFor(() => screen.getByTestId("otp-digit-0"));

    await user.type(screen.getByTestId("otp-digit-0"), "123456");

    // Completing the sixth digit submits without a further click.
    await waitFor(() =>
      expect(loginWithOtp).toHaveBeenCalledWith("a@b.com", "123456"),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("routes an admin to the admin area, as password login did", async () => {
    loginWithOtp.mockResolvedValue({ user: { role: "admin" } });
    const user = userEvent.setup();
    render(<PasswordlessLoginForm />);
    await user.type(screen.getByTestId("otp-email-input"), "a@b.com");
    await user.click(screen.getByTestId("otp-request-button"));
    await waitFor(() => screen.getByTestId("otp-digit-0"));
    await user.type(screen.getByTestId("otp-digit-0"), "123456");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"));
  });

  it("supports pasting the whole code", async () => {
    const user = userEvent.setup();
    render(<PasswordlessLoginForm />);
    await user.type(screen.getByTestId("otp-email-input"), "a@b.com");
    await user.click(screen.getByTestId("otp-request-button"));
    await waitFor(() => screen.getByTestId("otp-digit-0"));

    const first = screen.getByTestId("otp-digit-0") as HTMLInputElement;
    first.focus();
    await user.paste("654321");

    await waitFor(() =>
      expect(loginWithOtp).toHaveBeenCalledWith("a@b.com", "654321"),
    );
  });

  it("uses a numeric keypad on mobile", async () => {
    const user = userEvent.setup();
    render(<PasswordlessLoginForm />);
    await user.type(screen.getByTestId("otp-email-input"), "a@b.com");
    await user.click(screen.getByTestId("otp-request-button"));
    await waitFor(() => screen.getByTestId("otp-digit-0"));

    const digit = screen.getByTestId("otp-digit-0");
    expect(digit).toHaveAttribute("inputMode", "numeric");
    expect(digit).toHaveAttribute("autoComplete", "one-time-code");
  });

  it("shows the phone channel as unavailable rather than pretending", async () => {
    requestOtp.mockRejectedValue(
      apiError(
        "SMS_OTP_NOT_AVAILABLE",
        "تسجيل الدخول برقم الجوال غير متاح حاليًا. استخدم البريد الإلكتروني.",
      ),
    );
    const user = userEvent.setup();
    render(<PasswordlessLoginForm />);

    await user.click(screen.getByTestId("otp-channel-phone"));
    await user.type(screen.getByTestId("otp-phone-input"), "0512345678");
    await user.click(screen.getByTestId("otp-request-button"));

    await waitFor(() =>
      expect(screen.getByTestId("otp-error")).toHaveTextContent(
        /غير متاح حاليًا/,
      ),
    );
    // Critically, it does NOT advance to the code screen.
    expect(screen.queryByTestId("otp-digit-0")).toBeNull();
  });

  it.each([
    ["OTP_INVALID", "الرمز غير صحيح."],
    ["OTP_EXPIRED", "انتهت صلاحية الرمز. اطلب رمزًا جديدًا."],
    ["OTP_TOO_MANY_ATTEMPTS", "تجاوزت عدد المحاولات. اطلب رمزًا جديدًا."],
  ])("surfaces the %s state from the server", async (code, message) => {
    loginWithOtp.mockRejectedValue(apiError(code, message));
    const user = userEvent.setup();
    render(<PasswordlessLoginForm />);
    await user.type(screen.getByTestId("otp-email-input"), "a@b.com");
    await user.click(screen.getByTestId("otp-request-button"));
    await waitFor(() => screen.getByTestId("otp-digit-0"));

    await user.type(screen.getByTestId("otp-digit-0"), "000000");

    await waitFor(() =>
      expect(screen.getByTestId("otp-error")).toHaveTextContent(message),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("shows remaining attempts when the server reports them", async () => {
    loginWithOtp.mockRejectedValue(
      apiError("OTP_INVALID", "الرمز غير صحيح.", { remainingAttempts: 3 }),
    );
    const user = userEvent.setup();
    render(<PasswordlessLoginForm />);
    await user.type(screen.getByTestId("otp-email-input"), "a@b.com");
    await user.click(screen.getByTestId("otp-request-button"));
    await waitFor(() => screen.getByTestId("otp-digit-0"));
    await user.type(screen.getByTestId("otp-digit-0"), "000000");

    await waitFor(() =>
      expect(screen.getByTestId("otp-error")).toHaveTextContent("3"),
    );
  });

  it("counts down before offering a resend", async () => {
    const user = userEvent.setup();
    render(<PasswordlessLoginForm />);
    await user.type(screen.getByTestId("otp-email-input"), "a@b.com");
    await user.click(screen.getByTestId("otp-request-button"));

    await waitFor(() =>
      expect(screen.getByTestId("otp-cooldown")).toHaveTextContent("60"),
    );
    // The resend affordance is withheld until the cooldown lapses.
    expect(screen.queryByTestId("otp-resend-button")).toBeNull();
  });

  it("lets the user go back and change the identifier", async () => {
    const user = userEvent.setup();
    render(<PasswordlessLoginForm />);
    await user.type(screen.getByTestId("otp-email-input"), "a@b.com");
    await user.click(screen.getByTestId("otp-request-button"));
    await waitFor(() => screen.getByTestId("otp-digit-0"));

    await user.click(screen.getByTestId("otp-change-identifier"));

    expect(screen.getByTestId("otp-email-input")).toBeInTheDocument();
    expect(screen.queryByTestId("otp-digit-0")).toBeNull();
  });
});
