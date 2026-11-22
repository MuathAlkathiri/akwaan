import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/how-to-play", "/terms", "/privacy", "/refund"].map((path) => ({
    url: `https://playakwaan.com${path}`,
  }));
}
