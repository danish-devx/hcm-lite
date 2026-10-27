"use client";

import * as React from "react";
import { CalendarRange, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGetDepartmentsQuery } from "@/store/api/organizationApi";
import { addDays } from "@/lib/services/dashboard.service";

/**
 * Dashboard filters (M7 brief: "filterable by date range and department").
 *  - Presets: YTD / last 30 / last 90 / custom (from–to date inputs)
 *  - Department select (All departments + live list)
 * Value = { from, to, department } — server resolveRange phir bhi validate
 * karta hai (client dates company-tz se thoda off ho sakte hain).
 */

const PRESETS = [
  { key: "ytd", label: "Year to date" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "custom", label: "Custom range" },
];

function presetRange(key, today) {
  if (key === "30d") return { from: addDays(today, -29), to: today };
  if (key === "90d") return { from: addDays(today, -89), to: today };
  return { from: `${today.slice(0, 4)}-01-01`, to: today }; // ytd + custom fallback
}

export function FiltersBar({ today, value, onChange }) {
  const { data: departments } = useGetDepartmentsQuery();
  const [preset, setPreset] = React.useState("ytd");

  const applyPreset = (key) => {
    setPreset(key);
    if (key !== "custom") {
      onChange({ ...value, ...presetRange(key, today) });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <CalendarRange className="size-4" />
        <span className="micro-label">Filters</span>
      </div>

      <Select value={preset} onValueChange={applyPreset}>
        <SelectTrigger className="h-9 w-44 rounded-full text-xs">
          <SelectValue placeholder="Date range" />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.key} value={p.key}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {preset === "custom" ? (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value.from}
            max={value.to}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="h-9 rounded-full border bg-transparent px-3 text-xs tabular"
            aria-label="From date"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={value.to}
            min={value.from}
            max={today}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="h-9 rounded-full border bg-transparent px-3 text-xs tabular"
            aria-label="To date"
          />
        </div>
      ) : null}

      <Select
        value={value.department || "all"}
        onValueChange={(v) => onChange({ ...value, department: v === "all" ? null : v })}
      >
        <SelectTrigger className="h-9 w-48 rounded-full text-xs">
          <SelectValue placeholder="Department" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All departments</SelectItem>
          {(departments ?? []).map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {preset !== "ytd" || value.department ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-full px-3 text-xs text-muted-foreground"
          onClick={() => {
            setPreset("ytd");
            onChange({ from: `${today.slice(0, 4)}-01-01`, to: today, department: null });
          }}
        >
          <RotateCcw className="size-3" /> Reset
        </Button>
      ) : null}

      <p className="ml-auto hidden text-[11px] text-muted-foreground tabular sm:block">
        {value.from} → {value.to}
      </p>
    </div>
  );
}
