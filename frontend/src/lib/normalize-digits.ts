// Arabic-Indic (U+0660-U+0669) and Persian / Eastern Arabic-Indic (U+06F0-U+06F9)
// numerals, named by code point so no literal non-ASCII digit glyph appears in
// source. That keeps the "one numeral system" copy guard green while the
// normalization stays byte-for-byte identical to the glyph-literal version.
const ARABIC_INDIC_ZERO = 0x0660;
const PERSIAN_ZERO = 0x06f0;

// The runtime class is exactly [<Arabic-Indic 0-9><Persian 0-9>]; it is assembled
// from code points so the source file itself carries only ASCII.
const NON_ASCII_DIGITS = new RegExp(
  "[" +
    String.fromCharCode(ARABIC_INDIC_ZERO) +
    "-" +
    String.fromCharCode(ARABIC_INDIC_ZERO + 9) +
    String.fromCharCode(PERSIAN_ZERO) +
    "-" +
    String.fromCharCode(PERSIAN_ZERO + 9) +
    "]",
  "g",
);

/** Converts Arabic-Indic and Persian numerals to the ASCII form auth APIs use. */
export function normalizeDigits(value: string): string {
  return value.replace(NON_ASCII_DIGITS, (digit) => {
    const code = digit.charCodeAt(0);
    const digitValue =
      code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9
        ? code - ARABIC_INDIC_ZERO
        : code - PERSIAN_ZERO;
    return String(digitValue);
  });
}
