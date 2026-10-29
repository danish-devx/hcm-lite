"use client";

import { useEffect } from "react";

const FALLING_PETALS = [
  { left: "6%", size: 18, delay: "0s", dur: "11s", drift: "60px", op: 0.35 },
  { left: "18%", size: 12, delay: "2.5s", dur: "13s", drift: "-40px", op: 0.28 },
  { left: "38%", size: 16, delay: "5s", dur: "12s", drift: "50px", op: 0.3 },
  { left: "58%", size: 11, delay: "1.2s", dur: "14s", drift: "-60px", op: 0.25 },
  { left: "74%", size: 19, delay: "3.6s", dur: "12.5s", drift: "70px", op: 0.32 },
  { left: "88%", size: 14, delay: "6.4s", dur: "13.5s", drift: "-50px", op: 0.27 },
];

const FLOWER = [0, 72, 144, 216, 288];

const DANGER = "linear-gradient(145deg, var(--destructive), var(--chart-3))";

export default function Error({ error, reset }) {
  useEffect(() => {
    // Full error detail console me — debugging ke liye
    console.error("[HCM] Route error:", error);
  }, [error]);

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-6 py-16">
      {/* Soft glowing background blobs */}
      <div className="nf-blob nf-blob--one" aria-hidden="true" />
      <div className="nf-blob nf-blob--two" aria-hidden="true" />
      <div className="nf-blob nf-blob--three" aria-hidden="true" />

      {/* Falling petals — error tone */}
      <div className="nf-petals" aria-hidden="true">
        {FALLING_PETALS.map((p, i) => (
          <span
            key={i}
            className="nf-petal"
            style={{
              left: p.left,
              width: p.size,
              height: p.size * 1.5,
              animationDelay: p.delay,
              animationDuration: p.dur,
              "--nf-drift": p.drift,
              "--nf-op": p.op,
              background: DANGER,
            }}
          />
        ))}
      </div>

      {/* Glass card */}
      <div className="nf-rise relative z-10 w-full max-w-lg rounded-[2rem] border border-border bg-card/70 p-10 text-center shadow-2xl backdrop-blur-xl sm:p-12">
        {/* Flower + radar rings */}
        <div className="nf-rise nf-rise--1 relative mx-auto grid h-28 w-28 place-items-center">
          <span
            className="nf-ring"
            style={{ borderColor: "var(--destructive)" }}
            aria-hidden="true"
          />
          <span
            className="nf-ring nf-ring--two"
            style={{ borderColor: "var(--destructive)" }}
            aria-hidden="true"
          />
          <div className="nf-flower" aria-hidden="true">
            {FLOWER.map((a) => (
              <span
                key={a}
                className="nf-flower-petal"
                style={{ transform: `rotate(${a}deg) translateY(-16px)` }}
              />
            ))}
            <span
              className="nf-flower-center"
              style={{
                background:
                  "radial-gradient(circle at 35% 35%, var(--destructive), var(--chart-3))",
              }}
            />
          </div>
        </div>

        <p className="nf-code nf-rise nf-rise--2 mt-6" aria-hidden="true">
          Oops!
        </p>

        <h1 className="nf-rise nf-rise--3 mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="nf-rise nf-rise--4 mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          An unexpected error occurred while loading this page. Your data is
          safe — please try again.
        </p>

        {error?.message ? (
          <pre className="nf-rise nf-rise--5 mx-auto mt-4 max-h-24 max-w-sm overflow-auto rounded-xl bg-muted px-4 py-3 text-left text-xs text-muted-foreground">
            {error.message}
          </pre>
        ) : null}

        <div className="nf-rise nf-rise--6 mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={reset}
            className="nf-btn"
            style={{
              background:
                "linear-gradient(135deg, var(--destructive), var(--chart-3))",
              color: "#ffffff",
            }}
          >
            Try again
          </button>
          <button
            onClick={() => window.location.assign("/")}
            className="nf-btn nf-btn--ghost"
          >
            Go home
          </button>
        </div>
      </div>
    </main>
  );
}