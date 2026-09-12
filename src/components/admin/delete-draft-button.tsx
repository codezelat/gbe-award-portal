"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteInProgress } from "@/server/actions/draft-actions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
export function DeleteDraftButton({
  id,
  source,
  name,
  returnToList = false,
}: {
  id: string;
  source: string;
  name: string;
  returnToList?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const router = useRouter();
  async function remove() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    try {
      const result = await deleteInProgress({ id, source });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setOpen(false);
      toast.success("Draft deleted.");
      if (returnToList) router.replace("/admin/in-progress");
      router.refresh();
    } catch {
      toast.error("Could not delete this draft. Please retry.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) setOpen(value);
      }}
    >
      <AlertDialogTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={`Delete ${name}`} />
        }
      >
        <Trash2 />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
          <AlertDialogDescription>
            {name} and its saved attachments will be removed. Submitted
            nominations are not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => void remove()}
          >
            {pending ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : null}
            {pending ? "Deleting" : "Delete draft"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
