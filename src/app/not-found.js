import Link from "next/link";

const FALLING_PETALS = [
  { left: "6%", size: 18, delay: "0s", dur: "11s", drift: "60px", op: 0.35 },
  { left: "18%", size: 12, delay: "2.5s", dur: "13s", drift: "-40px", op: 0.28 },
  { left: "38%", size: 16, delay: "5s", dur: "12s", drift: "50px", op: 0.3 },
  { left: "58%", size: 11, delay: "1.2s", dur: "14s", drift: "-60px", op: 0.25 },
  { left: "74%", size: 19, delay: "3.6s", dur: "12.5s", drift: "70px", op: 0.32 },
  { left: "88%", size: 14, delay: "6.4s", dur: "13.5s", drift: "-50px", op: 0.27 },
];

const FLOWER = [0, 72, 144, 216, 288];

export default function NotFound() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-6 py-16">
      {/* Soft glowing background blobs */}
      <div className="nf-blob nf-blob--one" aria-hidden="true" />
      <div className="nf-blob nf-blob--two" aria-hidden="true" />
      <div className="nf-blob nf-blob--three" aria-hidden="true" />

      {/* Falling petals */}
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
            }}
          />
        ))}
      </div>

      {/* Glass card */}
      <div className="nf-rise relative z-10 w-full max-w-lg rounded-[2rem] border border-border bg-card/70 p-10 text-center shadow-2xl backdrop-blur-xl sm:p-12">
        {/* Flower + radar rings */}
        <div className="nf-rise nf-rise--1 relative mx-auto grid h-28 w-28 place-items-center">
          <span className="nf-ring" aria-hidden="true" />
          <span className="nf-ring nf-ring--two" aria-hidden="true" />
          <div className="nf-flower" aria-hidden="true">
            {FLOWER.map((a) => (
              <span
                key={a}
                className="nf-flower-petal"
                style={{ transform: `rotate(${a}deg) translateY(-16px)` }}
              />
            ))}
            <span className="nf-flower-center" />
          </div>
        </div>

        <p className="nf-code nf-rise nf-rise--2 mt-6" aria-hidden="true">
          404
        </p>

        <h1 className="nf-rise nf-rise--3 mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="nf-rise nf-rise--4 mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          The page you are looking for was moved, removed, renamed, or never
          existed. Let&apos;s get you back on track.
        </p>

        <div className="nf-rise nf-rise--5 mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="nf-btn">
            Go home
          </Link>
          <Link href="/dashboard" className="nf-btn nf-btn--ghost">
            Open dashboard
          </Link>
        </div>

        <p className="nf-rise nf-rise--6 mt-8 text-xs tracking-wide text-muted-foreground/70">
          Error code: 404 · Page does not exist
        </p>
      </div>
    </main>
  );
}