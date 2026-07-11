"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogIn } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({
      email: String(data.get("email")),
      password: String(data.get("password")),
      rememberMe: true,
    });
    setPending(false);
    if (result.error) {
      setError(
        "The email or password was not recognised. Check your details and try again.",
      );
      return;
    }
    if (result.data && "twoFactorRedirect" in result.data) {
      router.push("/auth/two-factor");
      return;
    }
    router.push("/auth/continue");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email address</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="h-[50px] bg-white"
          />
        </Field>
        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <a
              href="/auth/forgot-password"
              className="text-sm text-antique-gold hover:underline"
            >
              Forgot password?
            </a>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={12}
            className="h-[50px] bg-white"
          />
          <FieldDescription>Portal access is invitation only.</FieldDescription>
        </Field>
      </FieldGroup>
      <Button className="h-12" disabled={pending}>
        {pending ? (
          <LoaderCircle className="animate-spin" data-icon="inline-start" />
        ) : (
          <LogIn data-icon="inline-start" />
        )}
        Sign in securely
      </Button>
    </form>
  );
}
