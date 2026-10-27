"use client";

import * as React from "react";
import { Sparkles, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * AI chat bits (Phase 8) — assistant/user bubbles, "AI-generated" label
 * (brief guardrail), tool-trace chips aur plain-text reply renderer
 * (bullets + bold-lite). LLM plain text deta hai — markdown parse nahi karte.
 */

export function AiLabel({ className = "" }) {
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] text-muted-foreground ${className}`}>
      <Sparkles className="size-2.5" /> AI-generated
    </Badge>
  );
}

export function ToolTrace({ trace }) {
  if (!trace?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {trace.map((t, i) => (
        <span
          key={`${t.tool}-${i}`}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground tabular"
        >
          <Wrench className="size-2.5" />
          {t.tool}
          {t.ms != null ? ` · ${t.ms}ms` : ""}
        </span>
      ))}
    </div>
  );
}

/** Plain-text reply → paragraphs/bullets (LLM • bullets use karta hai). */
export function ReplyBody({ text }) {
  const lines = String(text ?? "").split("\n");
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("•") || trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const content = trimmed.replace(/^[•\-*]\s*/, "");
          return (
            <div key={i} className="flex gap-2">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary/70" />
              <span>{renderInline(content)}</span>
            </div>
          );
        }
        return <p key={i}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

/** **bold** aur `code` ka halka render — baaki text as-is. */
function renderInline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="rounded bg-muted px-1 py-0.5 text-[0.85em] tabular">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

/** Typing indicator — teen dots. */
export function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-primary/60"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}
