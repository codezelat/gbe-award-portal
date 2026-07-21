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
  facebookUrl: string;
};

const programmeMedia: readonly ProgrammeMedia[] = [
  {
    type: "reel",
    facebookUrl: "https://www.facebook.com/reel/2587233971693850",
  },
  {
    type: "reel",
    facebookUrl: "https://www.facebook.com/reel/989937467132055",
  },
  {
    type: "post",
    facebookUrl:
      "https://www.facebook.com/gbeaward/posts/pfbid033Pqy6icmSSfDim4BWb8QVFmF1dc17WQp6DZDtPUCQhEsk7vYtW4k4ZiRJALzxTrjl",
  },
  {
    type: "reel",
    facebookUrl: "https://www.facebook.com/reel/2060702991202509",
  },
  {
    type: "reel",
    facebookUrl: "https://www.facebook.com/reel/866956979470859",
  },
];

function getFacebookEmbedUrl(media: ProgrammeMedia) {
  const query = new URLSearchParams(
    media.type === "reel"
      ? {
          height: "711",
          href: media.facebookUrl,
          show_text: "false",
          width: "400",
        }
      : {
          href: media.facebookUrl,
          show_text: "true",
          width: "500",
        },
  );
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
  const isReel = media.type === "reel";

  const move = useCallback((direction: -1 | 1) => {
    setActiveIndex(
      (currentIndex) =>
        (currentIndex + direction + programmeMedia.length) %
        programmeMedia.length,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[calc(100svh-1rem)] w-[calc(100%-1rem)] gap-0 overflow-hidden border-0 bg-[#111] p-0 text-white shadow-2xl [&_[data-slot=dialog-close]]:right-2 [&_[data-slot=dialog-close]]:top-2 [&_[data-slot=dialog-close]]:z-20 [&_[data-slot=dialog-close]]:bg-black/55 [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:hover:bg-black/80",
          isReel ? "max-w-[400px]" : "max-w-[540px]",
        )}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>GBE Awards 2026 programme media</DialogTitle>
          <DialogDescription>
            An official Facebook post and four programme reels.
          </DialogDescription>
        </DialogHeader>

        <div
          aria-label="GBE Awards programme media"
          aria-roledescription="carousel"
          className="relative"
          onKeyDown={handleCarouselKeyDown}
          role="region"
          tabIndex={0}
        >
          {isReel ? (
            <div className="flex h-[calc(100svh-4rem)] max-h-[711px] items-center justify-center bg-black">
              <div className="aspect-[9/16] h-full max-w-full animate-in fade-in-0 duration-200">
                <iframe
                  key={media.facebookUrl}
                  allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                  allowFullScreen
                  className="block size-full border-0 bg-white"
                  data-testid="programme-facebook-embed"
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  src={getFacebookEmbedUrl(media)}
                  title={`GBE Awards 2026 programme item ${activeIndex + 1}`}
                />
              </div>
            </div>
          ) : (
            <iframe
              key={media.facebookUrl}
              allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
              allowFullScreen
              className="block h-[min(68svh,680px)] min-h-[300px] w-full animate-in border-0 bg-white fade-in-0 duration-200"
              data-testid="programme-facebook-embed"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              src={getFacebookEmbedUrl(media)}
              title={`GBE Awards 2026 programme item ${activeIndex + 1}`}
            />
          )}

          <Button
            type="button"
            aria-label="Previous programme item"
            className="absolute top-1/2 left-2 -translate-y-1/2 bg-black/55 text-white hover:bg-black/80"
            onClick={() => move(-1)}
            size="icon-lg"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            type="button"
            aria-label="Next programme item"
            className="absolute top-1/2 right-2 -translate-y-1/2 bg-black/55 text-white hover:bg-black/80"
            onClick={() => move(1)}
            size="icon-lg"
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>

        <div className="flex h-12 items-center justify-center gap-2 px-12">
          {programmeMedia.map((item, index) => (
            <button
              key={item.facebookUrl}
              aria-label={`Show programme item ${index + 1}`}
              aria-pressed={index === activeIndex}
              className={
                index === activeIndex
                  ? "h-1.5 w-6 rounded-full bg-white transition-all"
                  : "size-1.5 rounded-full bg-white/45 transition-all hover:bg-white/75"
              }
              onClick={() => setActiveIndex(index)}
              type="button"
            />
          ))}
        </div>

        <a
          aria-label={
            isReel
              ? "Open this reel with sound on Facebook"
              : "Open this post on Facebook"
          }
          className="absolute right-2 bottom-1.5 inline-flex size-9 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/12 hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/50"
          href={media.facebookUrl}
          rel="noopener noreferrer"
          target="_blank"
          title={isReel ? "Watch with sound" : "Open on Facebook"}
        >
          {isReel ? <Volume2 aria-hidden /> : <ExternalLink aria-hidden />}
        </a>
      </DialogContent>
    </Dialog>
  );
}
