import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { brand } from "@/config/brand";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
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
