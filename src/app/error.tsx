"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-[70vh] place-items-center px-5 py-16">
      <section className="surface max-w-lg rounded-lg p-8 text-center">
        <AlertTriangle className="mx-auto size-10 text-destructive" />
        <h1 className="font-display mt-5 text-4xl font-semibold">
          This action could not be completed
        </h1>
        <p className="mt-3 leading-7 text-graphite">
          Your information has not been silently discarded. Try the action
          again; if it continues, contact info@gbeaward.com and include
          reference {error.digest ?? "shown by support"}.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button
            variant="outline"
            render={<a href="mailto:info@gbeaward.com" />}
          >
            Contact support
          </Button>
        </div>
      </section>
    </main>
  );
}
