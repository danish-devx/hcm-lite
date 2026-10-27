import { ArrowRight } from "lucide-react";

import { SplitText } from "@/components/react-bits/split-text";
import { Logo } from "./logo";

const PILLARS = [
  {
    n: "01",
    title: "Attendance",
    text: "Check-in/out, corrections and honest timesheets.",
  },
  {
    n: "02",
    title: "Leave & Payroll",
    text: "Approvals, balances and payslips — always in sync.",
  },
  {
    n: "03",
    title: "AI Assistant",
    text: "Ask your HR anything, in plain words.",
  },
];

/**
 * Auth pages ka right-side brand panel (desktop only).
 * Ivory Bloom editorial pattern: hairline column grid, glow blooms,
 * blurred display serif headline, numbered pillars, circle-arrow CTA.
 */
export function AuthBrandPanel() {
  return (
    <div className="relative hidden overflow-hidden border-l bg-sidebar lg:flex lg:flex-col lg:justify-between">
      {/* vertical hairline column grid — pic ke grid dividers */}
      <div className="editorial-grid pointer-events-none absolute inset-0 opacity-70" />

      {/* glow blooms — apricot + deep plum */}
      <div className="pointer-events-none absolute -top-24 right-[8%] size-[26rem] rounded-full bg-[#f5a060]/30 blur-[110px] dark:bg-primary/15" />
      <div className="pointer-events-none absolute -bottom-36 -left-16 size-[24rem] rounded-full bg-[#74405a]/25 blur-[110px] dark:bg-[#74405a]/40" />

      {/* top row — logo + corner micro-label */}
      <div className="relative flex items-start justify-between p-10">
        <Logo />
        <p className="micro-label text-right leading-5">
          People · Time
          <br />
          Payroll
        </p>
      </div>

      {/* hero — blurred display serif, pic ke "Slow is a new power" pattern */}
      <div className="relative space-y-5 px-10">
        <p className="micro-label">A calmer way to run HR</p>
        <h2 className="max-w-lg font-display text-5xl leading-[1.05] font-medium tracking-tight">
          <SplitText text="People, beautifully managed." stagger={0.022} />
        </h2>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          A mindful HR space for sharper teams and brighter workdays.
        </p>
      </div>

      {/* numbered pillars + circle-arrow CTA */}
      <div className="relative px-10 pb-10">
        <div className="divide-y divide-border border-y border-border">
          {PILLARS.map((pillar) => (
            <div key={pillar.n} className="flex items-baseline gap-5 py-4">
              <span className="font-display text-sm italic text-primary tabular">
                {pillar.n}
              </span>
              <div>
                <div className="text-sm font-semibold">{pillar.title}</div>
                <div className="text-sm text-muted-foreground">{pillar.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-accent">
            <ArrowRight className="size-4" />
          </span>
          <span className="micro-label">Explore the workspace</span>
        </div>
      </div>
    </div>
  );
}
