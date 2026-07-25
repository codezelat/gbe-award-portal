"use client";

import { useRef } from "react";
import { purgeIncompleteApplicationAction } from "@/server/actions/application-actions";
import { Button } from "@/components/ui/button";

export function RemoveIncompleteNominationButton({
  applicationId,
  nomineeName,
}: {
  applicationId: string;
  nomineeName: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={purgeIncompleteApplicationAction}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <input
        type="hidden"
        name="confirmation"
        value="purge-incomplete-nomination"
      />
      <Button
        type="button"
        size="sm"
        variant="destructive"
        onClick={() => {
          if (
            window.confirm(
              `Remove the incomplete nomination for ${nomineeName}? This permanently deletes its unfinished payment record and uploaded files.`,
            )
          )
            formRef.current?.requestSubmit();
        }}
      >
        Remove incomplete
      </Button>
    </form>
  );
}
