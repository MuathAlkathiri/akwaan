/**
 * The OTP email: Arabic-first, right-to-left, and readable on a phone.
 *
 * Inline styles and a table-free single column on purpose — email clients strip
 * stylesheets and disagree about everything else. The code is the largest thing
 * on the screen because that is the only reason the message was opened.
 */

const BRAND = 'أكوان';

export function otpEmailSubject(): string {
  return `${BRAND} · رمز الدخول`;
}

function minutesLabel(expiresInSeconds: number): string {
  const minutes = Math.max(1, Math.round(expiresInSeconds / 60));
  if (minutes === 1) return 'دقيقة واحدة';
  if (minutes === 2) return 'دقيقتين';
  if (minutes <= 10) return `${minutes} دقائق`;
  return `${minutes} دقيقة`;
}

export function otpEmailText(code: string, expiresInSeconds: number): string {
  return [
    `${BRAND} — رمز الدخول`,
    '',
    `رمز التحقق: ${code}`,
    `ينتهي خلال ${minutesLabel(expiresInSeconds)}.`,
    '',
    'إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.',
  ].join('\n');
}

export function otpEmailHtml(code: string, expiresInSeconds: number): string {
  const spaced = code.split('').join(' ');
  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
  <body style="margin:0;padding:24px;background:#f5f4f0;font-family:-apple-system,'Segoe UI',Tahoma,Arial,sans-serif;">
    <div style="max-width:420px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px 24px;text-align:center;">
      <div style="font-size:22px;font-weight:700;color:#1f2340;letter-spacing:1px;">${BRAND}</div>
      <p style="margin:24px 0 8px;font-size:16px;color:#3b3f5c;">رمز الدخول الخاص بك</p>
      <div style="margin:16px 0;padding:16px;background:#f5f4f0;border-radius:12px;
                  font-size:34px;font-weight:700;letter-spacing:10px;color:#1f2340;
                  direction:ltr;font-family:'SFMono-Regular',Menlo,Consolas,monospace;">${spaced}</div>
      <p style="margin:8px 0 0;font-size:14px;color:#6b6f8a;">ينتهي هذا الرمز خلال ${minutesLabel(expiresInSeconds)}.</p>
      <hr style="margin:24px 0;border:none;border-top:1px solid #e8e6e0;" />
      <p style="margin:0;font-size:13px;color:#8b8fa6;line-height:1.7;">
        إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة بأمان.
      </p>
    </div>
  </body>
</html>`;
}
