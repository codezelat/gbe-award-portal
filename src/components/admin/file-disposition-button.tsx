"use client";

import { setFileDispositionAction } from "@/server/actions/file-admin-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function FileDispositionButton({
  fileId,
  mode,
}: {
  fileId: string;
  mode: "reject" | "supersede" | "delete";
}) {
  const label =
    mode === "reject"
      ? "Reject"
      : mode === "supersede"
        ? "Mark superseded"
        : "Delete retained object";
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant={mode === "delete" ? "destructive" : "outline"}
          />
        }
      >
        {label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={setFileDispositionAction}>
          <input type="hidden" name="fileId" value={fileId} />
          <input type="hidden" name="mode" value={mode} />
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm file disposition</AlertDialogTitle>
            <AlertDialogDescription>
              {mode === "delete"
                ? "This permanently removes an already non-current R2 object under retention authority."
                : "This removes the file from the current application view while preserving authorised history."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            name="reason"
            required
            minLength={8}
            maxLength={1000}
            placeholder="Mandatory operational reason"
            className="mt-4 bg-white"
          />
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              variant={mode === "delete" ? "destructive" : "default"}
            >
              Confirm {label.toLowerCase()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
