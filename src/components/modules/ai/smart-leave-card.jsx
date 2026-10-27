"use client";

import * as React from "react";
import { CalendarRange, CheckCircle2, Loader2, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { ApplyLeaveDialog } from "@/components/modules/leave/apply-dialog";
import { AiLabel } from "./ai-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getApiError } from "@/lib/api-error";
import { longDate } from "@/components/modules/leave/leave-bits";
import { useApplyLeaveMutation } from "@/store/api/leaveApi";
import { useSmartLeaveMutation } from "@/store/api/aiApi";
import { useGetMyLeaveQuery } from "@/store/api/leaveApi";

/**
 * Smart leave card (M8 F21) — plain words → pre-filled form, user confirms
 * (brief: "The user confirms"). Kabhi bhi yahan se direct save NAHI hota:
 * send request bhi POST /api/leave ke full rules se guzarti hai.
 */

const EXAMPLES = [
  "I need next Monday and Tuesday off for my sister's wedding",
  "Kal aur parso sick leave chahiye — fever hai",
  "Give me this Friday off, family errand",
];

export function SmartLeaveCard({ className }) {
  const [text, setText] = React.useState("");
  const [draft, setDraft] = React.useState(null);
  const [balance, setBalance] = React.useState(null);
  const [warnings, setWarnings] = React.useState([]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [fallbackOpen, setFallbackOpen] = React.useState(false);

  const [smartLeave, { isLoading }] = useSmartLeaveMutation();
  const [applyLeave, { isLoading: applying }] = useApplyLeaveMutation();
  const { data: me } = useGetMyLeaveQuery();

  async function run() {
    const request = text.trim();
    if (request.length < 4) {
      toast.error("Please type your leave request first.");
      return;
    }
    setDraft(null);
    setWarnings([]);
    try {
      const res = await smartLeave(request).unwrap();
      if (res?.fallback || !res?.draft) {
        toast.info(res?.message ?? "AI parse nahi kar saka — normal form khul raha hai.");
        setFallbackOpen(true);
        return;
      }
      setDraft(res.draft);
      setBalance(res.balance ?? null);
      setWarnings(res.warnings ?? []);
    } catch (err) {
      const msg = getApiError(err);
      toast.error(msg);
      if (!String(msg).toLowerCase().includes("linked")) setFallbackOpen(true);
    }
  }

  async function confirmSend() {
    if (!draft) return;
    try {
      await applyLeave({
        leaveTypeId: draft.leaveTypeId,
        startDate: draft.startDate,
        endDate: draft.endDate,
        reason: draft.reason,
      }).unwrap();
      toast.success("Leave request sent — HR will review it.");
      setDraft(null);
      setText("");
    } catch (err) {
      // Server rules ne roka — prefilled form khul jaye taake user fix kar sake
      toast.error(getApiError(err));
      setFormOpen(true);
    }
  }

  const linked = Boolean(me?.linked);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="size-4 text-primary" /> Smart leave
        </CardTitle>
        <CardDescription>
          Plain words me likhein — AI type, dates aur reason pre-fill kar dega. Aap confirm karein ge tabhi
          request jayegi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!linked ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Smart leave ke liye employee record link zaroori hai — HR se apna record link karwayein.
          </div>
        ) : (
          <>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="e.g. I need next Monday and Tuesday off for a wedding"
              aria-label="Describe your leave in plain words"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={run} disabled={isLoading} size="sm" className="rounded-full">
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Smart fill
              </Button>
              {EXAMPLES.slice(0, 1).map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setText(ex)}
                  className="truncate rounded-full border px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>

            {draft ? (
              <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="micro-label">AI draft — confirm karein</p>
                  <AiLabel />
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <CalendarRange className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{draft.typeName}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {draft.paid ? "Paid" : "Unpaid"}
                    </Badge>
                  </div>
                  <p className="tabular text-muted-foreground sm:text-right">
                    {longDate(draft.startDate)} → {longDate(draft.endDate)}
                  </p>
                </div>
                <p className="text-sm">
                  <span className="font-medium tabular">{draft.workingDays}</span> working day
                  {draft.workingDays === 1 ? "" : "s"}
                  {balance?.remaining != null ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {draft.typeName} remaining after: {Math.max(0, balance.remaining - draft.workingDays)}/
                      {balance.quota ?? "∞"}
                    </span>
                  ) : null}
                </p>
                {draft.reason ? (
                  <p className="text-xs italic text-muted-foreground">“{draft.reason}”</p>
                ) : null}
                {warnings.length ? (
                  <ul className="space-y-1">
                    {warnings.map((w) => (
                      <li key={w} className="flex items-start gap-1.5 text-xs text-warning">
                        <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                        {w}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    onClick={confirmSend}
                    disabled={applying || warnings.some((w) => w.includes("no working day"))}
                    size="sm"
                    className="rounded-full"
                  >
                    {applying ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    Confirm &amp; send
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-full" onClick={() => setFormOpen(true)}>
                    Edit in form
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-muted-foreground"
                    onClick={() => setDraft(null)}
                  >
                    Discard
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      {/* Prefilled edit form */}
      {me && draft ? (
        <ApplyLeaveDialog
          open={formOpen}
          onOpenChange={(o) => {
            setFormOpen(o);
            if (!o) setDraft(null);
          }}
          me={me}
          initial={draft}
          onApplied={() => {
            setDraft(null);
            setText("");
          }}
        />
      ) : null}

      {/* Fallback — normal empty form */}
      {me ? (
        <ApplyLeaveDialog
          open={fallbackOpen}
          onOpenChange={setFallbackOpen}
          me={me}
          onApplied={() => setText("")}
        />
      ) : null}
    </Card>
  );
}
