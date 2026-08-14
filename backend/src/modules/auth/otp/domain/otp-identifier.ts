import { BadRequestException } from '@nestjs/common';

export type OtpIdentifierType = 'email' | 'phone';

export interface NormalizedIdentifier {
  type: OtpIdentifierType;
  /** The canonical form. This is what is stored, indexed, and compared. */
  value: string;
}

/**
 * Saudi mobile numbers, reduced to one canonical string.
 *
 * The same phone arrives written half a dozen ways — `0512345678`,
 * `512345678`, `+966 51 234 5678`, `00966512345678` — and every one of them has
 * to land on the same account. Normalising at the edge is what keeps that from
 * becoming several accounts for one person, because everything downstream
 * compares the canonical value and nothing else.
 */
const SAUDI_COUNTRY_CODE = '966';
/** Saudi mobile subscriber numbers are nine digits and begin with 5. */
const SAUDI_MOBILE = /^5\d{8}$/;

/**
 * Deliberately permissive, and not RFC 5322.
 *
 * A stricter pattern rejects addresses that genuinely deliver, and the real
 * proof of an email is that its code comes back — so this only screens out
 * input that could not be an address at all.
 */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/g;

/** Arabic-Indic numerals reach the server from Arabic keyboards as-is. */
function toLatinDigits(value: string): string {
  return value.replace(ARABIC_INDIC_DIGITS, (digit) => {
    const code = digit.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

export function looksLikePhone(raw: string): boolean {
  const value = toLatinDigits(raw).trim();
  return /^[+\d][\d\s\-()]*$/.test(value) && !value.includes('@');
}

/**
 * @throws BadRequestException when the value is neither a usable email nor a
 * Saudi mobile number.
 */
export function normalizeIdentifier(raw: string): NormalizedIdentifier {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    throw new BadRequestException({
      code: 'IDENTIFIER_INVALID',
      message: 'أدخل بريدًا إلكترونيًا أو رقم جوال.',
    });
  }

  if (looksLikePhone(trimmed)) {
    return { type: 'phone', value: normalizeSaudiPhone(trimmed) };
  }

  const email = trimmed.toLowerCase();
  if (!EMAIL.test(email)) {
    throw new BadRequestException({
      code: 'IDENTIFIER_INVALID',
      message: 'أدخل بريدًا إلكترونيًا صحيحًا أو رقم جوال سعودي.',
    });
  }
  return { type: 'email', value: email };
}

export function normalizeSaudiPhone(raw: string): string {
  const digits = toLatinDigits(raw).replace(/[^\d+]/g, '');
  let national = digits;

  if (national.startsWith('+')) national = national.slice(1);
  // 00 is the other way the world writes a leading +.
  if (national.startsWith('00')) national = national.slice(2);
  if (national.startsWith(SAUDI_COUNTRY_CODE)) {
    national = national.slice(SAUDI_COUNTRY_CODE.length);
  }
  // A domestic trunk prefix, meaningful only inside the country.
  if (national.startsWith('0')) national = national.slice(1);

  if (!SAUDI_MOBILE.test(national)) {
    throw new BadRequestException({
      code: 'IDENTIFIER_INVALID',
      message: 'أدخل رقم جوال سعودي صحيح، مثل 05xxxxxxxx.',
    });
  }
  return `+${SAUDI_COUNTRY_CODE}${national}`;
}

/** What a generic response may echo back without confirming an account. */
export function maskIdentifier(identifier: NormalizedIdentifier): string {
  if (identifier.type === 'phone') {
    return `${identifier.value.slice(0, 4)}••••${identifier.value.slice(-2)}`;
  }
  const [local, domain] = identifier.value.split('@');
  const head = local.slice(0, 1);
  return `${head}${'•'.repeat(Math.max(1, local.length - 1))}@${domain}`;
}
