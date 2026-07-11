"use client";
import Script from "next/script";
import { useEffect, useRef } from "react";

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
  resetSignal = 0,
}: {
  onToken: (token: string) => void;
  resetSignal?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);
  const render = () => {
    if (!container.current || !window.turnstile || widget.current) return;
    widget.current = window.turnstile.render(container.current, {
      sitekey:
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ??
        "1x00000000000000000000AA",
      action: "gbe_nomination_submit",
      theme: "light",
      callback: onToken,
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
    });
  };
  useEffect(
    () => () => {
      if (widget.current) window.turnstile?.remove(widget.current);
    },
    [],
  );
  useEffect(() => {
    if (resetSignal > 0 && widget.current) {
      window.turnstile?.reset(widget.current);
      onTokenRef.current("");
    }
  }, [resetSignal]);
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={render}
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
