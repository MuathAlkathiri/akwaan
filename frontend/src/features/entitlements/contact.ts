import { SUPPORT_EMAIL } from "@/lib/support";

/**
 * The «كلمنا» link: an email already written.
 *
 * It carries the account's own email in the body because that is the one
 * thing the person answering needs and the one thing a player forgets to
 * say. Nothing is sent from here — it opens the player's mail app, and what
 * they send is theirs to edit.
 */
export function moreMatchesMailto(accountEmail?: string | null): string {
  const subject = "أبغى مباريات زيادة في أكوان";
  const body = [
    "هلا،",
    "",
    "خلصت مبارياتي هالأسبوع وأبغى زيادة.",
    "",
    `إيميل حسابي: ${accountEmail ?? ""}`,
  ].join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
