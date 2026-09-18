"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";
import { turnstileActions } from "@/config/turnstile";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
  }
}
export function Turnstile({
  onToken,
  action = turnstileActions.nomination,
  resetSignal = 0,
  compact = false,
}: {
  onToken: (token: string) => void;
  action?: string;
  resetSignal?: number;
  compact?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const onTokenRef = useRef(onToken);
  const previousReset = useRef(resetSignal);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);
  const render = useCallback(() => {
    if (!container.current || !window.turnstile || widget.current) return;
    widget.current = window.turnstile.render(container.current, {
      sitekey:
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ??
        "1x00000000000000000000AA",
      action,
      theme: "light",
      size: compact ? "compact" : "normal",
      callback: (token: string) => onTokenRef.current(token),
      "expired-callback": () => onTokenRef.current(""),
      "error-callback": () => onTokenRef.current(""),
    });
  }, [action, compact]);
  useEffect(() => {
    render();
    return () => {
      const id = widget.current;
      widget.current = undefined;
      if (id) window.turnstile?.remove(id);
    };
  }, [render]);
  useEffect(() => {
    if (previousReset.current === resetSignal) return;
    previousReset.current = resetSignal;
    if (widget.current) {
      window.turnstile?.reset(widget.current);
      onTokenRef.current("");
    }
  }, [resetSignal]);
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={render}
      />
      <div
        className="min-h-[70px]"
        ref={container}
        role="group"
        aria-label="Security verification"
      />
    </>
  );
}
