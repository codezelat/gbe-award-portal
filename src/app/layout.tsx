import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { brand } from "@/config/brand";
import "./globals.css";

const portalUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://access.gbeaward.com";

export const metadata: Metadata = {
  metadataBase: new URL(portalUrl),
  title: {
    default: "Apply for the GBE Awards 2026",
    template: "%s | GBE Awards",
  },
  description:
    "Submit your application for the Global Business Excellence Awards 2026 and showcase outstanding achievement, innovation and impact.",
  applicationName: brand.shortName,
  robots: { index: true, follow: true },
  openGraph: {
    title: "Apply for the GBE Awards 2026",
    description:
      "Recognition for outstanding organisations and leaders across the world.",
    type: "website",
    url: "/apply",
    siteName: brand.name,
    locale: "en_GB",
    images: [
      {
        url: "/brand/hero-award-2026.webp",
        width: 800,
        height: 1300,
        alt: "GBE Awards 2026",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Apply for the GBE Awards 2026",
    description:
      "Recognition for outstanding organisations and leaders across the world.",
    images: ["/brand/hero-award-2026.webp"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" data-scroll-behavior="smooth">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground"
        >
          Skip to main content
        </a>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
