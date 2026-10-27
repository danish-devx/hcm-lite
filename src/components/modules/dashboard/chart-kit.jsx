"use client";

import * as React from "react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";

/**
 * Chart.js kit (Phase 7) — warm Ivory Bloom palette se.
 * Colors runtime par CSS tokens se read hote hain (--chart-1..5), aur theme
 * switch (Ivory Bloom ↔ Plum Noir) par charts re-render hote hain:
 *   - html class MutationObserver (cookie toggle)
 *   - prefers-color-scheme listener (system theme path)
 * react-chartjs-2 + Chart.js dono project deps me pehle se registered hain.
 */

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

const FALLBACK = ["#a8552a", "#74405a", "#e09a5f", "#6e7f63", "#8a7a6b"];

function readToken(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

export function useChartTheme() {
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setNonce((n) => n + 1));
    const t = window.setTimeout(() => observer.observe(root, { attributes: true, attributeFilter: ["class"] }), 0);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => setNonce((n) => n + 1);
    mq.addEventListener("change", onScheme);
    return () => {
      window.clearTimeout(t);
      observer.disconnect();
      mq.removeEventListener("change", onScheme);
    };
  }, []);

  return React.useMemo(() => {
    const series = FALLBACK.map((fb, i) => readToken(`--chart-${i + 1}`, fb));
    return {
      nonce,
      series,
      text: readToken("--muted-foreground", "#6f5f68"),
      grid: readToken("--border", "#e7ded2"),
      card: readToken("--card", "#ffffff"),
      font: { family: "Inter, ui-sans-serif, system-ui, sans-serif", size: 11 },
    };
  }, [nonce]);
}

const TOOLTIP = {
  backgroundColor: "rgba(32,22,29,0.94)",
  titleColor: "#f7efe7",
  bodyColor: "#e8dcd2",
  titleFont: { weight: "600" },
  padding: 10,
  cornerRadius: 8,
  boxPadding: 4,
};

function axisScales(theme, { yCompact = null, stacked = false, horizontal = false } = {}) {
  const catTick = { color: theme.text, font: theme.font, maxRotation: 0, autoSkip: true, maxTicksLimit: 14 };
  const valueTick = {
    color: theme.text,
    font: theme.font,
    maxTicksLimit: 6,
    callback: yCompact ?? ((v) => v),
  };
  if (horizontal) {
    // value axis = x, category axis = y
    return {
      x: {
        stacked,
        beginAtZero: true,
        ticks: yCompact ? valueTick : catTick,
        grid: { color: theme.grid, lineWidth: 1 },
        border: { display: false },
      },
      y: { stacked, ticks: catTick, grid: { display: false }, border: { color: theme.grid } },
    };
  }
  return {
    x: { stacked, ticks: catTick, grid: { display: false }, border: { color: theme.grid } },
    y: {
      stacked,
      beginAtZero: true,
      ticks: valueTick,
      grid: { color: theme.grid, lineWidth: 1 },
      border: { display: false },
    },
  };
}

function legendFor(theme, show) {
  return {
    display: show,
    position: "bottom",
    labels: { color: theme.text, font: theme.font, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "circle", padding: 14 },
  };
}

/** Multi-series line — attendance/payroll trends. */
export function TrendLine({ labels, datasets, theme, height = 260, yCompact = null, suffix = "" }) {
  return (
    <div style={{ height }} key={theme.nonce}>
      <Line
        data={{ labels, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: legendFor(theme, datasets.length > 1),
            tooltip: {
              ...TOOLTIP,
              callbacks: {
                label: (ctx) =>
                  ` ${ctx.dataset.label}: ${Number(ctx.parsed.y).toLocaleString("en-US")}${suffix}`,
              },
            },
          },
          scales: axisScales(theme, { yCompact }),
          elements: { point: { radius: 2.5, hitRadius: 12, hoverRadius: 4 } },
        }}
      />
    </div>
  );
}

/** Vertical / horizontal bars. */
export function BarsChart({ labels, datasets, theme, height = 260, horizontal = false, yCompact = null, suffix = "", stacked = false }) {
  return (
    <div style={{ height }} key={theme.nonce}>
      <Bar
        data={{ labels, datasets }}
        options={{
          indexAxis: horizontal ? "y" : "x",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: legendFor(theme, datasets.length > 1),
            tooltip: {
              ...TOOLTIP,
              callbacks: {
                label: (ctx) => {
                  const v = horizontal ? ctx.parsed.x : ctx.parsed.y;
                  const val = yCompact ? yCompact(v) : Number(v).toLocaleString("en-US");
                  return ` ${ctx.dataset.label}: ${val}${suffix}`;
                },
              },
            },
          },
          scales: axisScales(theme, { yCompact, stacked, horizontal }),
          elements: { bar: { borderRadius: 6, maxBarThickness: horizontal ? 22 : 34 } },
        }}
      />
    </div>
  );
}

/** Doughnut — gender split, leave by type. */
export function DonutChart({ labels, values, theme, height = 220, colors, suffix = "" }) {
  const palette = colors ?? theme.series;
  return (
    <div style={{ height }} key={theme.nonce}>
      <Doughnut
        data={{
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: labels.map((_, i) => palette[i % palette.length]),
              borderColor: theme.card,
              borderWidth: 2,
              hoverOffset: 6,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: "62%",
          plugins: {
            legend: legendFor(theme, true),
            tooltip: {
              ...TOOLTIP,
              callbacks: {
                label: (ctx) => ` ${ctx.label}: ${Number(ctx.parsed).toLocaleString("en-US")}${suffix}`,
              },
            },
          },
        }}
      />
    </div>
  );
}

/** Flat alpha version of a series color (area fill under lines). */
export function withAlpha(color, alpha) {
  const hex = color.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
