const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
  reactStrictMode: true,
  // Fullscreen tutorial previews must not include Next's development indicator.
  devIndicators: false,
};

module.exports = nextConfig;
