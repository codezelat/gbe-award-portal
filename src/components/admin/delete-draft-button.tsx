"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteInProgress,
  deleteInProgressBatch,
} from "@/server/actions/draft-actions";
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
  return (
    <DeleteInProgressButton
      records={[{ id, source, name }]}
      returnToList={returnToList}
    />
  );
}

type Selection = { id: string; source: string; name: string };

export function DeleteInProgressButton({
  records,
  bulk = false,
  returnToList = false,
  onDeleted,
}: {
  records: Selection[];
  bulk?: boolean;
  returnToList?: boolean;
  onDeleted?: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failures, setFailures] = useState<
    { id: string; name: string; message: string }[]
  >([]);
  const lock = useRef(false);
  const router = useRouter();
  async function remove() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    try {
      const result = bulk
        ? await deleteInProgressBatch(
            records.map(({ id, source }) => ({ id, source })),
          )
        : await deleteInProgress({
            id: records[0].id,
            source: records[0].source,
          }).then((single) =>
            single.ok
              ? {
                  ok: true as const,
                  deleted: records,
                  failed: [] as {
                    id: string;
                    source: string;
                    message: string;
                  }[],
                }
              : single,
          );
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const { deleted, failed } = result;
      onDeleted?.(deleted.map((row) => row.id));
      setFailures(
        failed.map((row) => ({
          ...row,
          name:
            records.find((record) => record.id === row.id)?.name ??
            "Nomination",
        })),
      );
      if (!failed.length) setOpen(false);
      if (deleted.length)
        toast.success(
          `${deleted.length} ${deleted.length === 1 ? "record" : "records"} deleted.`,
        );
      if (failed.length)
        toast.error(
          `${failed.length} ${failed.length === 1 ? "record was" : "records were"} not deleted.`,
          {
            description: failed
              .map(
                (row) =>
                  `${records.find((record) => record.id === row.id)?.name ?? "Nomination"}: ${row.message}`,
              )
              .join("\n"),
            duration: 12000,
          },
        );
      if (returnToList) router.replace("/admin/in-progress");
      router.refresh();
    } catch {
      toast.error("Could not delete these records. Please retry.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          if (value) setFailures([]);
        }
      }}
    >
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant={bulk ? "destructive" : "ghost"}
            size={bulk ? "default" : "icon"}
            className={bulk ? "h-11" : "size-11 shrink-0"}
            disabled={!records.length}
            aria-label={bulk ? "Delete selected" : `Delete ${records[0]?.name}`}
          />
        }
      >
        <Trash2
          aria-hidden="true"
          data-icon={bulk ? "inline-start" : undefined}
        />
        {bulk ? "Delete selected" : null}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {bulk
              ? `Delete ${records.length} selected ${records.length === 1 ? "record" : "records"}?`
              : "Delete this record?"}
          </AlertDialogTitle>
          <AlertDialogDescription className="[overflow-wrap:anywhere]">
            {bulk ? "Selected records" : records[0]?.name} will be removed from
            In-progress. Completed nominations are protected.
            {records.some((row) => row.source === "card")
              ? " Payment history is retained. A later verified card payment restores the nomination."
              : " Saved draft attachments will be removed."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failures.length ? (
          <div role="alert" className="flex flex-col gap-3 text-sm">
            <p className="font-medium">Not deleted</p>
            {failures.map((row) => (
              <p key={row.id} className="[overflow-wrap:anywhere]">
                <span className="font-medium">{row.name}</span>
                <br />
                {row.message}
              </p>
            ))}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11" disabled={pending}>
            {failures.length ? "Close" : "Cancel"}
          </AlertDialogCancel>
          <Button
            variant="destructive"
            className="h-11"
            type="button"
            disabled={pending || !records.length}
            aria-busy={pending}
            onClick={() => void remove()}
          >
            {pending ? (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                data-icon="inline-start"
              />
            ) : null}
            {pending
              ? "Deleting"
              : failures.length
                ? "Retry remaining"
                : "Delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
