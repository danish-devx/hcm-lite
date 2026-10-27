"use client";

import * as React from "react";
import { Check, Copy, KeyRound, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * One-time temp password dialog — auto-login handover ka core UX.
 * Password sirf isi dialog me dikhta hai (copy karne ke baad bhi re-open nahi hota).
 */
export function TempPasswordDialog({ open, onOpenChange, email, tempPassword, title }) {
  const [copied, setCopied] = React.useState(false);

  function handleOpenChange(v) {
    if (!v) setCopied(false);
    onOpenChange?.(v);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${email ?? ""}\n${tempPassword ?? ""}`.trim());
      setCopied(true);
    } catch {
      // clipboard blocked — user manually select kar le
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-primary" />
            {title ?? "Login created"}
          </DialogTitle>
          <DialogDescription>
            Ye temporary password <span className="font-medium text-foreground">sirf abhi</span> dikhega
            — copy kar ke employee se securely share karein. Pehli login par system password change
            karne ko force karega.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {email ? (
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <p className="micro-label text-[10px]">Login email</p>
              <p className="mt-0.5 text-sm font-medium break-all">{email}</p>
            </div>
          ) : null}
          <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
            <p className="micro-label text-[10px]">Temporary password</p>
            <p className="mt-0.5 font-mono text-lg font-semibold tracking-wide break-all">
              {tempPassword}
            </p>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
            Ye password dobara nahi milega. Agar kho jaye to &ldquo;Reset password&rdquo; se naya
            temp password issue karein.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          <Button type="button" onClick={copy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy credentials"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
