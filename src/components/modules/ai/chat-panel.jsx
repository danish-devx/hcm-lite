"use client";

import * as React from "react";
import { SendHorizontal, Sparkles, User } from "lucide-react";
import { toast } from "sonner";

import { AiLabel, ReplyBody, ToolTrace, TypingDots } from "./ai-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { useSendAiChatMutation } from "@/store/api/aiApi";

/**
 * AI chat panel (M8 F19) — real data answers via server-side tools.
 * Client sirf messages bhejta hai; tool loop + scoping server par hoti hai.
 * Har assistant reply ke neeche "AI-generated" label (brief guardrail).
 */

const SUGGESTIONS = {
  admin: [
    "How many active employees do we have?",
    "What is this month's attendance rate?",
    "Who came late most often this month?",
    "What is our payroll cost per month?",
  ],
  hr: [
    "Who is on leave today?",
    "What is this month's attendance rate?",
    "Who came late most often this month?",
    "How many pending leave approvals do we have?",
  ],
  employee: [
    "How many sick leaves do I have left this year?",
    "What are my leave balances?",
    "Show me my latest payslip",
  ],
};

const HISTORY_LIMIT = 12;

export function ChatPanel({ role, className }) {
  const [messages, setMessages] = React.useState([]); // {role, content, trace?, id}
  const [input, setInput] = React.useState("");
  const [sendChat, { isLoading }] = useSendAiChatMutation();
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  async function submit(text) {
    const content = (text ?? input).trim();
    if (!content || isLoading) return;
    const userMsg = { role: "user", content, id: `u${Date.now()}` };
    const history = [...messages, userMsg]
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-HISTORY_LIMIT)
      .map(({ role: r, content: c }) => ({ role: r, content: c }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const res = await sendChat(history).unwrap();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res?.reply ?? "…",
          trace: res?.toolTrace ?? [],
          id: `a${Date.now()}`,
        },
      ]);
    } catch (err) {
      const msg = getApiError(err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: msg, error: true, id: `a${Date.now()}` },
      ]);
      if (!String(msg).toLowerCase().includes("limit")) toast.error(msg);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const suggestions = SUGGESTIONS[role] ?? SUGGESTIONS.employee;

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl border bg-card", className)}>
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="size-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Bloom — HR assistant</p>
          <p className="text-[11px] text-muted-foreground">
            Real data se jawab · tools aap ke role ke scope me chalte hain
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Assalam-o-alaikum! Main aap ke HR data se jawab deti hoon — pooch kar dekhein:
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end gap-2.5">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
                  {m.content}
                </div>
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  <User className="size-3.5 text-muted-foreground" />
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex justify-start gap-2.5">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="size-3.5 text-primary" />
                </div>
                <div className="max-w-[88%] space-y-1.5">
                  <div
                    className={cn(
                      "rounded-2xl rounded-bl-sm border px-3.5 py-2.5",
                      m.error ? "border-destructive/40 bg-destructive/5" : "bg-muted/40"
                    )}
                  >
                    <ReplyBody text={m.content} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <AiLabel />
                    <ToolTrace trace={m.trace} />
                  </div>
                </div>
              </div>
            )
          )
        )}
        {isLoading ? (
          <div className="flex justify-start gap-2.5">
            <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="size-3.5 text-primary" />
            </div>
            <div className="rounded-2xl rounded-bl-sm border bg-muted/40 px-3.5 py-2">
              <TypingDots />
            </div>
          </div>
        ) : null}
      </div>

      {/* Composer */}
      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask anything about your HR data… (Enter to send)"
            rows={1}
            className="max-h-28 min-h-10 flex-1 resize-none rounded-xl"
            aria-label="Message the assistant"
          />
          <Button
            size="icon"
            className="size-10 shrink-0 rounded-xl"
            onClick={() => submit()}
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
          >
            <SendHorizontal className="size-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          ~20 requests/hour limit · answers AI-generated hain — critical decisions verify karein
        </p>
      </div>
    </div>
  );
}
