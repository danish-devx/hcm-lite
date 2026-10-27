import { Flower2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Bloom logo — terracotta bloom mark + editorial serif wordmark.
 * (Ivory Bloom theme — pic ke lily motif se inspired)
 */
export function Logo({ className, textClassName }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
        <Flower2 className="size-4.5" strokeWidth={1.75} />
      </div>
      <div className="leading-tight">
        <div
          className={cn(
            "font-display text-xl italic leading-none tracking-tight",
            textClassName
          )}
        >
          Bloom
        </div>
        <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          HCM · Lite
        </div>
      </div>
    </div>
  );
}
