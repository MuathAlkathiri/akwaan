const path = require("path");

/**
 * Headers every response carries.
 *
 * The site had none of these: no HSTS, nothing about framing, nothing about
 * sniffing or referrers. It has a login page and a payment flow, so each one
 * below closes a real door rather than ticking a box.
 *
 * Two deliberate omissions:
 *
 * - **A full `Content-Security-Policy`.** Next ships inline bootstrap scripts,
 *   so a real policy needs nonces threaded through middleware; a rushed one
 *   either breaks the app or is loose enough to be theatre. `frame-ancestors`
 *   is the part that protects a session today, and it needs no nonces.
 * - **`microphone=()`.** المرحلة listens through the browser's own
 *   `SpeechRecognition` (`use-voice-input.ts`), which Chrome gates behind this
 *   very policy — denying it would silently kill voice answers. Allowed to this
 *   origin only.
 */
const securityHeaders = [
  // Two years, subdomains included. Not `preload`: that is a submission to a
  // browser list that is slow to undo, and it is not ours to make here.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Belt and braces: the modern directive, and the header older browsers read.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(self)",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
  reactStrictMode: true,
  // Fullscreen tutorial previews must not include Next's development indicator.
  devIndicators: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
