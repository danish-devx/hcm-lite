"use client";

import * as React from "react";
import { BookOpenCheck, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ChatPanel } from "./chat-panel";
import { SmartLeaveCard } from "./smart-leave-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * /assistant body (M8) — role-aware:
 *  - chat sab roles ke liye (F19)
 *  - smart leave hr/employee (F21 — admin per matrix excluded)
 *  - policy Q&A har role (F22) — rules system prompt me hain
 */

const ASK_IDEAS = {
  admin: [
    "Company headcount, gender split ya department breakdown",
    "Payroll cost per month aur average salary",
    "Attendance rate, absenteeism aur late-comers",
    "Leave utilization by type",
  ],
  hr: [
    "Who is on leave today?",
    "Pending approvals aur leave utilization",
    "Top late-comers aur attendance trend",
    "Payroll draft months ka gross/net",
  ],
  employee: [
    "Apni leave balances aur upcoming requests",
    "Apna attendance summary aur late count",
    "Apne finalized payslips (gross/net)",
    "Company policy — grace time, quotas, tax slabs",
  ],
};

export function AssistantClient({ role, companyName }) {
  const ideas = ASK_IDEAS[role] ?? ASK_IDEAS.employee;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        index="08"
        eyebrow={`AI Assistant · ${role}`}
        title="Ask Bloom"
        description={`${companyName} ke real data se jawab — tools aap ke role ke scope me chalte hain. Roman Urdu ya English, jo aap ko asaan lage.`}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <ChatPanel role={role} className="h-[560px] sm:h-[620px] lg:col-span-3" />

        <div className="space-y-4 lg:col-span-2">
          {role !== "admin" ? <SmartLeaveCard /> : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpenCheck className="size-4 text-primary" /> What can I ask?
              </CardTitle>
              <CardDescription>Aap ke role ke scope me ye sab available hai:</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {ideas.map((idea) => (
                  <li key={idea} className="flex gap-2 text-sm">
                    <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-primary/70" />
                    <span className="text-muted-foreground">{idea}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" /> Privacy &amp; scope
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>
                AI aap ke login ke scope se bahar data NAHI dekh sakta — {role === "employee" ? "aap ka apna data aur company policy" : "aap ke role ka allowed data"} hi tools me aata hai.
              </p>
              <p>
                Salary ya confidential sawalat scope se bahar hon to assistant politely refuse karta hai — sab calls
                audit log (ai_logs) me record hoti hain.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
