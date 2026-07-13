import type { MetadataRoute } from "next";

const portalUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://access.gbeaward.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${portalUrl}/apply`,
      changeFrequency: "weekly",
      priority: 1,
      images: [`${portalUrl}/brand/hero-award-2026.webp`],
    },
    {
      url: `${portalUrl}/help`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${portalUrl}/privacy`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${portalUrl}/terms`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
