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
  responsive = false,
}: {
  onToken: (token: string) => void;
  action?: string;
  resetSignal?: number;
  responsive?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const widgetSize = useRef<string | undefined>(undefined);
  const onTokenRef = useRef(onToken);
  const previousReset = useRef(resetSignal);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);
  const render = useCallback(() => {
    if (!container.current || !window.turnstile) return;
    // Flexible widgets require 300px. Use Cloudflare's unscaled compact layout
    // only when the actual form column is narrower, and centre it in that case.
    const size = responsive
      ? (frame.current?.clientWidth ?? 0) >= 300
        ? "flexible"
        : "compact"
      : "normal";
    if (widget.current && widgetSize.current === size) return;
    if (widget.current) {
      window.turnstile.remove(widget.current);
      widget.current = undefined;
      onTokenRef.current("");
    }
    widgetSize.current = size;
    if (responsive) {
      container.current.style.width = size === "compact" ? "150px" : "100%";
      container.current.style.minHeight = size === "compact" ? "140px" : "65px";
    }
    widget.current = window.turnstile.render(container.current, {
      sitekey:
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ??
        "1x00000000000000000000AA",
      action,
      theme: "light",
      size,
      callback: (token: string) => onTokenRef.current(token),
      "expired-callback": () => onTokenRef.current(""),
      "error-callback": () => onTokenRef.current(""),
    });
  }, [action, responsive]);
  useEffect(() => {
    render();
    const observer = responsive ? new ResizeObserver(render) : null;
    if (observer && frame.current) observer.observe(frame.current);
    return () => {
      observer?.disconnect();
      const id = widget.current;
      widget.current = undefined;
      widgetSize.current = undefined;
      if (id) window.turnstile?.remove(id);
    };
  }, [render, responsive]);
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
        className="flex min-h-[70px] w-full min-w-0 justify-center"
        ref={frame}
        role="group"
        aria-label="Security verification"
      >
        <div ref={container} className="w-full" />
      </div>
    </>
  );
}
