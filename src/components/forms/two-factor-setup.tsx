"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
export function TwoFactorSetup({
  redirectTo = "/admin",
}: {
  redirectTo?: string;
}) {
  const router = useRouter();
  const [uri, setUri] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  async function enable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const password = String(new FormData(event.currentTarget).get("password"));
    const result = await authClient.twoFactor.enable({
      password,
      issuer: "GBE Awards Portal",
    });
    if (result.error) {
      setError("The password could not be confirmed.");
      return;
    }
    setUri(result.data.totpURI);
    setCodes(result.data.backupCodes);
  }
  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code"));
    const result = await authClient.twoFactor.verifyTotp({
      code,
      trustDevice: false,
    });
    if (result.error) {
      setError("The authenticator code was not accepted.");
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }
  if (!uri)
    return (
      <form onSubmit={enable} className="flex flex-col gap-5">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <label className="flex flex-col gap-2 text-sm font-medium">
          Confirm current password
          <Input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="h-[50px] bg-white"
          />
        </label>
        <Button>Begin MFA enrolment</Button>
      </form>
    );
  return (
    <div className="flex flex-col gap-5">
      <Alert>
        <AlertDescription>
          Add this account to a TOTP authenticator. Store the recovery codes
          securely; they are shown only once.
        </AlertDescription>
      </Alert>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Authenticator setup URI
        <Input
          readOnly
          value={uri}
          className="h-[50px] bg-white font-mono text-xs"
        />
      </label>
      <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-4 font-mono text-sm">
        {codes.map((code) => (
          <span key={code}>{code}</span>
        ))}
      </div>
      <form onSubmit={verify} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Six-digit authenticator code
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            minLength={6}
            maxLength={6}
            required
            className="h-[50px] bg-white"
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button>Verify and enter administration</Button>
      </form>
    </div>
  );
}
