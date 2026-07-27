"use client";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
type Session = {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date;
  expiresAt: Date;
};
export function AccountSecurity() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"password" | string | null>(null);
  useEffect(() => {
    authClient
      .listSessions()
      .then((result) => setSessions((result.data ?? []) as Session[]));
  }, []);
  async function change(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending("password");
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: String(data.get("currentPassword")),
          newPassword: String(data.get("newPassword")),
        }),
      });
      const result = await response.json();
      if (!result.ok) {
        setError(
          "The current password was not accepted or the new password is invalid.",
        );
        return;
      }
      setMessage("Password updated and other sessions revoked.");
      form.reset();
    } catch {
      setError(
        "The password service could not be reached. Check your connection and try again.",
      );
    } finally {
      setPending(null);
    }
  }
  async function revoke(token: string) {
    if (pending) return;
    setPending(token);
    try {
      await authClient.revokeSession({ token });
      setSessions((current) =>
        current.filter((session) => session.token !== token),
      );
    } catch {
      setError(
        "The session could not be revoked. Check your connection and try again.",
      );
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="surface rounded-lg p-6">
        <h2 className="section-title">Change password</h2>
        <form onSubmit={change} className="mt-5 flex flex-col gap-4">
          {message ? (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <label className="flex flex-col gap-2 text-sm font-medium">
            Current password
            <Input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              className="h-[50px] bg-white"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            New password
            <Input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              className="h-[50px] bg-white"
            />
          </label>
          <Button
            disabled={pending !== null}
            loading={pending === "password"}
            loadingLabel="Updating password"
          >
            Update password
          </Button>
        </form>
      </section>
      <section className="surface rounded-lg p-6">
        <h2 className="section-title">Active sessions</h2>
        <div className="mt-5 flex flex-col gap-3">
          {sessions.map((session) => (
            <div key={session.id} className="rounded-md border bg-white p-4">
              <p className="text-sm font-medium">
                {session.userAgent ?? "Unknown device"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {session.ipAddress ?? "Private network"} · expires{" "}
                {new Date(session.expiresAt).toLocaleDateString("en-GB")}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                disabled={pending !== null}
                loading={pending === session.token}
                loadingLabel="Revoking"
                onClick={() => revoke(session.token)}
              >
                Revoke session
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
