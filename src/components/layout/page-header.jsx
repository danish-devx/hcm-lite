/**
 * Editorial page header — Ivory Bloom pattern.
 * Eyebrow micro-label + numbered display-serif title + actions slot.
 */
export function PageHeader({ index, eyebrow, title, description, actions }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          {eyebrow ? <p className="micro-label">{eyebrow}</p> : null}
          <div className="flex items-baseline gap-3">
            {index ? (
              <span className="font-display text-sm text-primary italic tabular">
                {index}
              </span>
            ) : null}
            <h2 className="font-display text-3xl font-medium tracking-tight">
              {title}
            </h2>
          </div>
          {description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
