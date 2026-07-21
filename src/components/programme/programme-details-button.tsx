"use client";

import dynamic from "next/dynamic";
import { PlayCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const loadProgrammeDetailsDialog = () =>
  import("./programme-details-dialog").then(
    (module) => module.ProgrammeDetailsDialog,
  );

const ProgrammeDetailsDialog = dynamic(loadProgrammeDetailsDialog, {
  ssr: false,
});

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
      {shouldRenderDialog ? (
        <ProgrammeDetailsDialog open={open} onOpenChange={setOpen} />
      ) : null}
    </>
  );
}
