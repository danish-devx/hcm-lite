"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, Flower2 } from "lucide-react";

/**
 * Chat preview panel app ko cross-site iframe me embed karta hai.
 * Agar browser us context me session cookies write nahi karne deta
 * (third-party cookie blocking), to login persist nahi hota aur user
 * har sign-in ke baad wapas login page par aa jata hai.
 *
 * Yeh guard sirf tab run hota hai jab page frame ke andar ho — tab check
 * karta hai ke cookies writable hain ya nahi. Agar nahi, to ek polite
 * banner dikhata hai: "Open in a new tab" (+ copy link fallback).
 * Normal top-level browser me yeh kabhi render nahi hota.
 */

function cookiesWritable() {
  try {
    const key = "__bloom_cookie_test";
    const attrs =
      window.location.protocol === "https:"
        ? "SameSite=None; Secure"
        : "SameSite=Lax";
    document.cookie = `${key}=1; path=/; ${attrs}`;
    const ok = document.cookie.includes(key);
    document.cookie = `${key}=; path=/; Max-Age=0; ${attrs}`;
    return ok;
  } catch {
    return false;
  }
}

export function IframeGuard() {
  const [showBanner, setShowBanner] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      let framed = false;
      try {
        framed = window.self !== window.top;
      } catch {
        // cross-origin frame access denied → definitively framed
        framed = true;
      }
      if (!framed) return;

      setUrl(window.location.origin);
      // Sirf tab banner dikhao jab cookies sach me persist na ho sakin —
      // agar SameSite=None cookies allowed hain to app iframe me hi chal jayegi.
      if (!cookiesWritable()) setShowBanner(true);
    }, 50);
    return () => window.clearTimeout(timer);
  }, []);

  function copyLink() {
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  }

  if (!showBanner) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[100] border-b border-primary/25 bg-card/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-3.5 sm:flex-row sm:gap-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Flower2 className="size-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="micro-label mb-0.5">Preview notice</p>
          <p className="text-sm leading-snug text-foreground">
            This preview is embedded in a frame that drops session cookies, so
            sign-in cannot persist here.
            <span className="font-medium text-foreground">
              {" "}
              Open Bloom in a new tab
            </span>{" "}
            and sign in again.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <ExternalLink className="size-3.5" />
            New tab
          </a>
          <button
            type="button"
            onClick={copyLink}
            aria-label="Copy workspace link"
            className="inline-flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? (
              <Check className="size-3.5 text-success" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
