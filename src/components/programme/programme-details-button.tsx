"use client";

import dynamic from "next/dynamic";
import { Download, PlayCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const loadProgrammeDetailsDialog = () =>
  import("./programme-details-dialog").then(
    (module) => module.ProgrammeDetailsDialog,
  );

const ProgrammeDetailsDialog = dynamic(loadProgrammeDetailsDialog, {
  ssr: false,
});

const eventBrochureUrl =
  "https://drive.usercontent.google.com/download?id=1rJ1JfccI57Yyr928QCoCr_1UqjmU9z3c&export=download&confirm=t";

export function ProgrammeDetailsButton() {
  const [shouldRenderDialog, setShouldRenderDialog] = useState(false);
  const [open, setOpen] = useState(false);

  function prefetchDialog() {
    void loadProgrammeDetailsDialog();
  }

  function openDialog() {
    setShouldRenderDialog(true);
    setOpen(true);
  }

  return (
    <>
      <div className="flex flex-col items-stretch gap-2">
        <a
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#1c6b4b]/25 bg-white px-4 text-sm font-medium text-[#15553c] shadow-sm transition-colors hover:bg-[#eef7f2] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#1c6b4b]/30"
          href={eventBrochureUrl}
        >
          <Download aria-hidden />
          Download Event Brochure
        </a>
        <Button
          type="button"
          className="h-10 gap-2 bg-[#1c6b4b] px-4 text-white shadow-sm hover:bg-[#15553c] focus-visible:border-[#15553c] focus-visible:ring-[#1c6b4b]/30"
          onClick={openDialog}
          onFocus={prefetchDialog}
          onPointerEnter={prefetchDialog}
          aria-haspopup="dialog"
        >
          <PlayCircle aria-hidden />
          View Program Details
        </Button>
      </div>
      {shouldRenderDialog ? (
        <ProgrammeDetailsDialog open={open} onOpenChange={setOpen} />
      ) : null}
    </>
  );
}
