"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkCardPaymentAction } from "@/server/actions/card-payment-actions";

export function CardPaymentCheck({
  applicationId,
  attemptId,
  needsTransactionId = false,
}: {
  applicationId: string;
  attemptId?: string;
  needsTransactionId?: boolean;
}) {
  const [state, action, pending] = useActionState(checkCardPaymentAction, {
    message: "",
    ok: false,
  });
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <form action={action} className="mt-3 max-w-sm space-y-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      {needsTransactionId ? (
        <details className="text-xs">
          <summary className="cursor-pointer py-2">
            Recover an interrupted checkout
          </summary>
          <p className="my-2">Find this local reference in Genie:</p>
          <p className="break-all font-mono">{attemptId}</p>
          <label className="mt-3 block">
            Genie transaction ID
            <Input
              name="transactionId"
              placeholder="24-character transaction ID"
              maxLength={24}
              className="mt-1"
            />
          </label>
        </details>
      ) : (
        <input name="transactionId" type="hidden" value="" />
      )}
      <Button size="sm" variant="outline" disabled={pending}>
        {pending && <LoaderCircle className="animate-spin" />}Check Genie status
      </Button>
      {state.message && (
        <p
          role="status"
          className={`text-xs ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
