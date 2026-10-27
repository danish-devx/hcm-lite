"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";

import { AiLabel, ReplyBody } from "./ai-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getApiError } from "@/lib/api-error";
import { useSummarizeDashboardMutation } from "@/store/api/aiApi";

/**
 * AI summary card (M8 F20 — admin+HR dashboards). "Summarize" current KPI
 * JSON (current filters) server ko bhejta hai → 3-5 insight bullets sirf
 * unhi numbers se (brief Section 4). Employee dashboard par nahi hota.
 */

function buildPayload(dashboard, data) {
  if (dashboard === "admin") {
    return {
      kpis: data.kpis,
      headcountByDept: data.headcountByDept,
      payrollByDept: data.payrollByDept,
      payrollTrend: (data.payrollTrend ?? []).slice(-12),
      gender: data.gender,
      tenure: data.tenure,
      avgSalaryByDesignation: (data.avgSalaryByDesignation ?? []).slice(0, 8),
    };
  }
  return {
    kpis: data.kpis,
    totals: data.totals,
    absenteeismByDept: data.absenteeismByDept,
    leaveByType: data.leaveByType,
    topLateComers: data.topLateComers,
    recentTrend: (data.trend ?? []).slice(-14),
  };
}

export function AiSummaryCard({ dashboard, data, filters }) {
  const [summarize, { isLoading }] = useSummarizeDashboardMutation();
  const [summary, setSummary] = React.useState(null);
  const [note, setNote] = React.useState(null);
  const [error, setError] = React.useState(null);

  async function run() {
    setError(null);
    setNote(null);
    try {
      const res = await summarize({
        dashboard,
        payload: buildPayload(dashboard, data),
        filters: { from: filters?.from, to: filters?.to, department: filters?.department ?? null },
      }).unwrap();
      setSummary(res?.summary ?? null);
      setNote(res?.fallback ?? null);
    } catch (err) {
      setError(getApiError(err));
    }
  }

  const hasResult = summary || note || error;

  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" /> AI summary
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasResult ? <AiLabel /> : null}
            <Button onClick={run} disabled={isLoading} size="sm" variant="outline" className="rounded-full">
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {hasResult ? "Re-summarize" : "Summarize with AI"}
            </Button>
          </div>
        </div>
      </CardHeader>
      {hasResult ? (
        <CardContent>
          {summary ? (
            <div className="rounded-xl bg-muted/40 px-4 py-3">
              <ReplyBody text={summary} />
            </div>
          ) : null}
          {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
