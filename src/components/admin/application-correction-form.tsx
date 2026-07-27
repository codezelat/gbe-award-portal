"use client";

import {
  useActionState,
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  editApplicationWithStateAction,
  type ApplicationCorrectionState,
} from "@/server/actions/application-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialState: ApplicationCorrectionState = {
  status: "idle",
  message: "",
};

export function ApplicationCorrectionForm({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submittedValues = useRef<Map<string, string>>(new Map());
  const [state, action] = useActionState(
    editApplicationWithStateAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      submittedValues.current.clear();
      toast.success(state.message);
      return;
    }
    if (state.status !== "error" || !formRef.current) return;
    for (const [name, value] of submittedValues.current) {
      const control = formRef.current.elements.namedItem(name);
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement ||
        control instanceof HTMLSelectElement
      )
        control.value = value;
    }
  }, [state.message, state.status]);

  function rememberSubmittedValues(event: FormEvent<HTMLFormElement>) {
    const values = new Map<string, string>();
    for (const [name, value] of new FormData(event.currentTarget)) {
      if (name !== "reauthPassword" && typeof value === "string")
        values.set(name, value);
    }
    submittedValues.current = values;
  }

  return (
    <form
      ref={formRef}
      action={action}
      className={className}
      onSubmit={rememberSubmittedValues}
    >
      {state.status === "error" ? (
        <Alert className="md:col-span-2" variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {children}
    </form>
  );
}
