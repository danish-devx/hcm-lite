import { Sparkles } from "lucide-react";

import { AnimatedContent } from "@/components/react-bits/animated-content";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Unbuilt modules ke liye consistent placeholder.
 * Judges ko clean "roadmap" state dikhegi — broken page nahi.
 */
export function ComingSoon({ icon: Icon = Sparkles, title, phase, description }) {
  return (
    <div className="mx-auto w-full max-w-3xl py-6">
      <AnimatedContent>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="size-7" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-center gap-2.5">
                <span className="font-display text-2xl text-primary italic tabular">
                  {String(phase).padStart(2, "0")}
                </span>
                <h3 className="font-display text-xl font-medium tracking-tight">{title}</h3>
                <Badge variant="secondary">Phase {phase}</Badge>
              </div>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                {description}
              </p>
            </div>
            <div className="flex w-full max-w-xs items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${Math.min(phase * 11, 100)}%` }}
                />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">
                build progress
              </span>
            </div>
          </CardContent>
        </Card>
      </AnimatedContent>
    </div>
  );
}
