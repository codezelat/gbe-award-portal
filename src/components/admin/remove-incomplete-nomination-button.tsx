import { purgeIncompleteApplicationAction } from "@/server/actions/application-actions";
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

export function RemoveIncompleteNominationButton({
  applicationId,
  nomineeName,
}: {
  applicationId: string;
  nomineeName: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button type="button" size="sm" variant="destructive" />}
      >
        Remove incomplete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={purgeIncompleteApplicationAction}>
          <input type="hidden" name="applicationId" value={applicationId} />
          <input
            type="hidden"
            name="confirmation"
            value="purge-incomplete-nomination"
          />
          <AlertDialogHeader>
            <AlertDialogTitle>Remove incomplete nomination?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the unfinished payment record and any staged files
              for {nomineeName}. The immutable audit record is retained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction type="submit" variant="destructive">
              Remove incomplete
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
