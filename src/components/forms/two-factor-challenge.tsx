"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
export function TwoFactorChallenge() {
  const router = useRouter();
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code"));
    const result = await authClient.twoFactor.verifyTotp({
      code,
      trustDevice: false,
    });
    if (result.error) {
      setError(
        "The authenticator code was not accepted. Check the current code and try again.",
      );
      return;
    }
    router.push("/auth/continue");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <label className="flex flex-col gap-2 text-sm font-medium">
        Authenticator code
        <Input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          minLength={6}
          maxLength={6}
          required
          autoFocus
          className="h-[50px] bg-white text-center font-mono text-xl tracking-[.35em]"
        />
      </label>
      <Button>Verify secure access</Button>
    </form>
  );
}
