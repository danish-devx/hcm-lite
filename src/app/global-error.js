"use client";

import { useEffect } from "react";
import "./globals.css"; // global-error root layout ko replace karta hai — theme yahan dobara load karni parti hai

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("[HCM] Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <main className="grid min-h-dvh place-items-center px-6">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-xl">
            <h1 className="text-2xl font-semibold">Application error</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A critical error occurred. Please reload the application.
            </p>
            <button
              onClick={reset}
              className="mt-6 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}