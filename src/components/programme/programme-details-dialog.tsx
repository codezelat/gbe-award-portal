"use client";

import { ChevronLeft, ChevronRight, ExternalLink, Volume2 } from "lucide-react";
import { useCallback, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ProgrammeMedia = {
  type: "post" | "reel";
  title: string;
  description: string;
  facebookUrl: string;
};

const programmeMedia: readonly ProgrammeMedia[] = [
  {
    type: "post",
    title: "2026 programme announcement",
    description: "Read the official awards announcement and nomination invitation.",
    facebookUrl:
      "https://www.facebook.com/gbeaward/posts/pfbid033Pqy6icmSSfDim4BWb8QVFmF1dc17WQp6DZDtPUCQhEsk7vYtW4k4ZiRJALzxTrjl",
  },
  {
    type: "reel",
    title: "Programme reel 1",
    description: "Watch a short introduction to the 2026 awards programme.",
    facebookUrl: "https://www.facebook.com/reel/2587233971693850",
  },
  {
    type: "reel",
    title: "Programme reel 2",
    description: "Explore more from the 2026 awards programme.",
    facebookUrl: "https://www.facebook.com/reel/989937467132055",
  },
  {
    type: "reel",
    title: "Programme reel 3",
    description: "Watch another official 2026 programme reel.",
    facebookUrl: "https://www.facebook.com/reel/2060702991202509",
  },
  {
    type: "reel",
    title: "Programme reel 4",
    description: "Watch the final official 2026 programme reel.",
    facebookUrl: "https://www.facebook.com/reel/866956979470859",
  },
];

function getFacebookEmbedUrl(media: ProgrammeMedia) {
  const query = new URLSearchParams({
    href: media.facebookUrl,
    show_text: media.type === "post" ? "true" : "false",
    width: "500",
  });
  const plugin = media.type === "post" ? "post.php" : "video.php";

  return `https://www.facebook.com/plugins/${plugin}?${query.toString()}`;
}

type ProgrammeDetailsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ProgrammeDetailsDialog({
  open,
  onOpenChange,
}: ProgrammeDetailsDialogProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const media = programmeMedia[activeIndex];
  const isFirst = activeIndex === 0;
  const isLast = activeIndex === programmeMedia.length - 1;

  const move = useCallback((direction: -1 | 1) => {
    setActiveIndex((currentIndex) =>
      Math.min(
        programmeMedia.length - 1,
        Math.max(0, currentIndex + direction),
      ),
    );
  }, []);

  function handleCarouselKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    }
  }

  const isReel = media.type === "reel";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-1.25rem)] w-[calc(100%-1.25rem)] max-w-4xl gap-0 overflow-y-auto p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-mist px-5 pb-4 pt-5 pr-12 sm:px-7 sm:pb-5 sm:pt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-antique-gold">
            GBE Awards 2026
          </p>
          <DialogTitle className="text-2xl sm:text-3xl">
            Programme details
          </DialogTitle>
          <DialogDescription className="max-w-2xl leading-6">
            Browse the official announcement and short programme reels without
            leaving your nomination. Use Facebook&apos;s player controls to unmute,
            or open a reel with sound in Facebook.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 sm:p-6">
          <div
            aria-label="GBE Awards programme media"
            aria-roledescription="carousel"
            className="grid gap-4"
            onKeyDown={handleCarouselKeyDown}
            role="region"
            tabIndex={0}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-antique-gold">
                  {media.type === "post" ? "Official post" : "Official reel"}
                </p>
                <h3 className="mt-1 font-heading text-2xl font-semibold text-ink">
                  {media.title}
                </h3>
                <p className="mt-1 max-w-xl text-sm leading-6 text-graphite">
                  {media.description}
                </p>
              </div>
              <p className="shrink-0 pt-1 text-sm font-medium tabular-nums text-muted-foreground">
                {activeIndex + 1} / {programmeMedia.length}
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-mist bg-muted/40">
              <iframe
                key={media.facebookUrl}
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                allowFullScreen
                className="block h-[min(64svh,680px)] min-h-[430px] w-full border-0 bg-white"
                data-testid="programme-facebook-embed"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                src={getFacebookEmbedUrl(media)}
                title={`GBE Awards 2026 ${media.title}`}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                aria-label="Carousel controls"
                className="flex items-center gap-2"
                role="group"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => move(-1)}
                  disabled={isFirst}
                  aria-label="Previous programme item"
                >
                  <ChevronLeft aria-hidden />
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => move(1)}
                  disabled={isLast}
                  aria-label="Next programme item"
                >
                  Next
                  <ChevronRight aria-hidden />
                </Button>
              </div>

              <a
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#1c6b4b] px-3 text-sm font-medium text-white transition-colors hover:bg-[#15553c] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#1c6b4b]/30"
                href={media.facebookUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {isReel ? <Volume2 aria-hidden /> : <ExternalLink aria-hidden />}
                {isReel ? "Watch with sound" : "Open on Facebook"}
              </a>
            </div>

            <div
              aria-label="Choose programme item"
              className="flex flex-wrap justify-center gap-2"
              role="group"
            >
              {programmeMedia.map((item, index) => (
                <button
                  key={item.facebookUrl}
                  aria-label={`Show ${item.title}`}
                  aria-pressed={index === activeIndex}
                  className={cn(
                    "h-2.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    index === activeIndex
                      ? "w-7 bg-[#1c6b4b]"
                      : "w-2.5 bg-mist hover:bg-champagne",
                  )}
                  onClick={() => setActiveIndex(index)}
                  type="button"
                />
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
