"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const email = String(new FormData(event.currentTarget).get("email"));
    await authClient.requestPasswordReset({
      email,
      redirectTo: "/auth/reset-password",
    });
    setPending(false);
    setSent(true);
  }
  if (sent)
    return (
      <Alert>
        <AlertDescription>
          If an account exists for that address, a secure reset link has been
          queued. Check your inbox and spam folder.
        </AlertDescription>
      </Alert>
    );
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Email address
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-[50px] bg-white"
        />
      </label>
      <Button disabled={pending}>
        {pending ? "Requesting…" : "Send reset link"}
      </Button>
    </form>
  );
}
export function ResetPasswordForm({ token }: { token: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    if (password !== String(data.get("confirmPassword"))) {
      setError("Passwords do not match.");
      return;
    }
    const result = await authClient.resetPassword({
      token,
      newPassword: password,
    });
    if (result.error) {
      setError("This reset link is invalid, expired or already used.");
      return;
    }
    setMessage("Your password has been changed. Other sessions were revoked.");
  }
  if (message)
    return (
      <Alert>
        <AlertDescription>
          {message}{" "}
          <a href="/login" className="underline">
            Sign in
          </a>
          .
        </AlertDescription>
      </Alert>
    );
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <label className="flex flex-col gap-2 text-sm font-medium">
        New password
        <Input
          name="password"
          type="password"
          minLength={12}
          maxLength={128}
          required
          autoComplete="new-password"
          className="h-[50px] bg-white"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Confirm password
        <Input
          name="confirmPassword"
          type="password"
          minLength={12}
          maxLength={128}
          required
          autoComplete="new-password"
          className="h-[50px] bg-white"
        />
      </label>
      <Button>Set new password</Button>
    </form>
  );
}
