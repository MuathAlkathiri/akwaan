/**
 * The Akwaan sign-in email. Transactional only.
 *
 * Two constraints shape everything here.
 *
 * First, email clients are not browsers: stylesheets get stripped, `<div>`
 * layout collapses, flexbox and grid are unreliable, and remote images are
 * blocked by default. So the structure is nested tables with inline styles, no
 * web fonts, no images, and no JavaScript — the message must look finished with
 * nothing loaded but the HTML.
 *
 * Second, the code must never break across lines. In production the sixth digit
 * wrapped on a phone, which turns a five-second task into a confusing one. Six
 * fixed-width cells in a single centred table row, inside a `nowrap` container,
 * make wrapping structurally impossible rather than merely unlikely — a table
 * row is not a wrapping context, so no viewport width can push a cell down.
 */

const BRAND = 'أكوان';

/**
 * Fixed dark palette. Every critical colour is repeated directly on the
 * relevant table or cell (and backgrounds also use legacy `bgcolor`) so Gmail
 * and Outlook do not have to infer a light/dark variant from client settings.
 */
const COLORS = {
  canvas: '#15131c',
  card: '#20223a',
  digit: '#242640',
  primary: '#f5f1e8',
  secondary: '#bbb6ce',
  brand: '#d8d1ee',
  border: '#777189',
} as const;

const FONT_STACK = "Arial, 'Helvetica Neue', Helvetica, Tahoma, sans-serif";

/**
 * One digit cell, sized for the narrowest phone rather than the roomiest.
 *
 * The budget at 320px: 16px outer padding each side plus 8px around the code
 * cell leaves 272px. Six 40px cells with 4px gaps come to 264px, so the row
 * fits with room to spare — and being fixed, it fits every wider screen too.
 * Sizing for a 390px phone is exactly how the sixth digit ended up wrapping.
 */
const DIGIT_CELL_WIDTH = 40;
const DIGIT_CELL_GAP = 4;

export function otpEmailSubject(): string {
  // No code in the subject: subjects show on lock screens and sync to devices
  // the recipient may not control.
  return `رمز الدخول إلى ${BRAND}`;
}

/** Inbox preview line. Deliberately excludes the code, for the same reason. */
export function otpEmailPreheader(expiresInSeconds: number): string {
  return `رمز الدخول إلى ${BRAND} صالح لمدة ${minutesLabel(expiresInSeconds)}`;
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
    `رمز الدخول إلى ${BRAND}`,
    '',
    `رمزك هو: ${code}`,
    '',
    `ينتهي هذا الرمز خلال ${minutesLabel(expiresInSeconds)}.`,
    '',
    'إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.',
    '',
    `© ${BRAND}`,
  ].join('\n');
}

/** The six digit cells, as one unbreakable table row. */
function digitCells(code: string): string {
  return code
    .split('')
    .map(
      (digit) => `<td align="center" valign="middle" width="${DIGIT_CELL_WIDTH}"
              style="width:${DIGIT_CELL_WIDTH}px;padding:0 ${DIGIT_CELL_GAP / 2}px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     width="100%" style="width:100%;border-collapse:separate;">
                <tr>
                  <td align="center" valign="middle" height="48"
                      bgcolor="${COLORS.digit}"
                      style="height:48px;background-color:${COLORS.digit};border:1px solid ${COLORS.border};
                             border-radius:10px;font-family:${FONT_STACK};font-size:22px;line-height:48px;
                             font-weight:bold;color:${COLORS.primary};white-space:nowrap;">${digit}</td>
                </tr>
              </table>
            </td>`,
    )
    .join('\n            ');
}

export function otpEmailHtml(code: string, expiresInSeconds: number): string {
  const expiry = minutesLabel(expiresInSeconds);
  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>${otpEmailSubject()}</title>
  </head>
  <body bgcolor="${COLORS.canvas}" style="margin:0;padding:0;background-color:${COLORS.canvas};">
    <!-- Preview text: shown in the inbox list, hidden in the open message. -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
      ${otpEmailPreheader(expiresInSeconds)}
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           bgcolor="${COLORS.canvas}"
           style="width:100%;background-color:${COLORS.canvas};margin:0;padding:0;">
      <tr>
        <td align="center" valign="top" bgcolor="${COLORS.canvas}"
            style="padding:32px 16px;background-color:${COLORS.canvas};">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520"
                 align="center" bgcolor="${COLORS.card}" dir="rtl"
                 style="width:100%;max-width:520px;background-color:${COLORS.card};
                        border:1px solid ${COLORS.border};border-radius:16px;">
            <tr>
              <td align="center" valign="middle" bgcolor="${COLORS.card}"
                  style="padding:36px 28px 8px 28px;background-color:${COLORS.card};
                  font-family:${FONT_STACK};font-size:24px;font-weight:bold;
                  color:${COLORS.brand};letter-spacing:0.5px;">${BRAND}</td>
            </tr>
            <tr>
              <td align="center" valign="middle" bgcolor="${COLORS.card}"
                  style="padding:16px 28px 0 28px;background-color:${COLORS.card};
                  font-family:${FONT_STACK};font-size:17px;color:${COLORS.secondary};">
                رمز الدخول الخاص بك
              </td>
            </tr>
            <tr>
              <td align="center" valign="middle" bgcolor="${COLORS.card}"
                  style="padding:24px 8px;background-color:${COLORS.card};">
                <!--
                  dir="ltr" and nowrap: the code reads left to right even inside
                  an RTL message, and the row cannot break onto a second line.
                -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="264"
                       dir="ltr" align="center" bgcolor="${COLORS.card}"
                       style="width:264px;border-collapse:separate;white-space:nowrap;margin:0 auto;background-color:${COLORS.card};">
                  <tr>
            ${digitCells(code)}
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" valign="middle" bgcolor="${COLORS.card}"
                  style="padding:4px 28px 0 28px;background-color:${COLORS.card};
                  font-family:${FONT_STACK};font-size:15px;line-height:1.8;color:${COLORS.secondary};">
                استخدم هذا الرمز لإكمال تسجيل الدخول إلى ${BRAND}.
              </td>
            </tr>
            <tr>
              <td align="center" valign="middle" bgcolor="${COLORS.card}"
                  style="padding:12px 28px 0 28px;background-color:${COLORS.card};
                  font-family:${FONT_STACK};font-size:15px;color:${COLORS.primary};font-weight:bold;">
                ينتهي هذا الرمز خلال ${expiry}.
              </td>
            </tr>
            <tr>
              <td bgcolor="${COLORS.card}" style="padding:28px 28px 0 28px;background-color:${COLORS.card};">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr><td style="border-top:1px solid ${COLORS.border};font-size:0;line-height:0;">&nbsp;</td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" valign="middle" bgcolor="${COLORS.card}"
                  style="padding:20px 28px 0 28px;background-color:${COLORS.card};
                  font-family:${FONT_STACK};font-size:13px;line-height:1.8;color:${COLORS.secondary};">
                إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة بأمان.
              </td>
            </tr>
            <tr>
              <td align="center" valign="middle" bgcolor="${COLORS.card}"
                  style="padding:20px 28px 32px 28px;background-color:${COLORS.card};
                  font-family:${FONT_STACK};font-size:12px;color:${COLORS.secondary};">
                © ${BRAND}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Exposed so tests can assert the layout maths rather than restate it. */
export const OTP_EMAIL_LAYOUT = {
  digitCellWidth: DIGIT_CELL_WIDTH,
  digitCellGap: DIGIT_CELL_GAP,
  /** Total width six cells occupy, which must fit the narrowest phone. */
  codeRowWidth: 6 * (DIGIT_CELL_WIDTH + DIGIT_CELL_GAP),
} as const;
