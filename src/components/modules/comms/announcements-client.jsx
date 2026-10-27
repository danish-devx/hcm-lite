"use client";

import * as React from "react";
import { Megaphone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/modules/org/confirm-dialog";
import {
  useCreateAnnouncementMutation,
  useDeleteAnnouncementMutation,
  useGetAnnouncementsQuery,
} from "@/store/api/commsApi";
import { RoleBadge, avatarToneFor, fullStamp, initialsFor, timeAgo } from "./comms-bits";

const postSchema = (t, b) => {
  const errors = {};
  if (!t || t.trim().length < 3) errors.title = "Title is too short (min 3).";
  if (t && t.trim().length > 120) errors.title = "Max 120 characters.";
  if (!b || b.trim().length < 5) errors.body = "Body is too short (min 5).";
  if (b && b.trim().length > 2000) errors.body = "Max 2000 characters.";
  return errors;
};

export function AnnouncementsClient({ role }) {
  const isStaff = role === "admin" || role === "hr";
  const { data: items, isLoading } = useGetAnnouncementsQuery();

  const [composerOpen, setComposerOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [deleteAnnouncementAsync] = useDeleteAnnouncementMutation();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        index="09"
        eyebrow="Comms · Company updates"
        title="Announcements"
        description={
          isStaff
            ? "Company-wide updates post karein — sab active logins ko turant in-app notification milti hai aur ye dashboards par dikhti hain."
            : "Company-wide updates — HR/Admin yahan posts karte hain; nayi post par aap ko notification bhi milti hai."
        }
        actions={
          isStaff ? (
            <Button className="rounded-full" onClick={() => setComposerOpen(true)}>
              <Plus className="size-4" /> New announcement
            </Button>
          ) : null
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : (items ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Megaphone className="size-8 text-muted-foreground/50" />
            <p className="font-display text-lg">No announcements yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {isStaff
                ? "Pehli post publish karein — poora company notify ho jayega."
                : "Jab HR/Admin koi update post karega, wo yahan aur notification bell me dikhegi."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(items ?? []).map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-8">
                      <AvatarFallback
                        className={`text-[11px] font-semibold ${avatarToneFor(item.author?.full_name)}`}
                      >
                        {initialsFor(item.author?.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {item.author?.full_name ?? "Unknown"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {timeAgo(item.created_at)} · {fullStamp(item.created_at)}
                      </p>
                    </div>
                    <RoleBadge role={item.author?.role} />
                  </div>
                  {item.canDelete ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete announcement"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
                <h3 className="font-display text-xl font-medium tracking-tight">
                  {item.title}
                </h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {item.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ComposerDialog open={composerOpen} onOpenChange={setComposerOpen} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete announcement?"
        description={`“${deleteTarget?.title ?? ""}” permanently remove ho jayegi. Ye action audit log me record hoga.`}
        onConfirm={async () => {
          try {
            await deleteAnnouncementAsync(deleteTarget.id).unwrap();
            toast.success("Announcement deleted.");
            setDeleteTarget(null);
          } catch (err) {
            toast.error(err?.data?.error ?? "Delete failed.");
          }
        }}
      />
    </div>
  );
}

function ComposerDialog({ open, onOpenChange }) {
  const [createAnnouncement, { isLoading }] = useCreateAnnouncementMutation();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [errors, setErrors] = React.useState({});

  React.useEffect(() => {
    if (open) {
      // reset on open — eslint set-state-in-effect rule ke saath timeout pattern
      const t = window.setTimeout(() => {
        setTitle("");
        setBody("");
        setErrors({});
      }, 0);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open]);

  async function handleSubmit() {
    const errs = postSchema(title, body);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    try {
      const res = await createAnnouncement({ title: title.trim(), body: body.trim() }).unwrap();
      toast.success(
        res?.notified > 0
          ? `Posted — ${res.notified} team member${res.notified === 1 ? "" : "s"} notified.`
          : "Announcement posted."
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.data?.error ?? "Could not post the announcement.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="size-4 text-primary" /> New announcement
          </DialogTitle>
          <DialogDescription>
            Sab active logins ko in-app notification jayegi aur ye dashboards par dikhegi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="ann-title">Title</Label>
            <Input
              id="ann-title"
              value={title}
              maxLength={120}
              placeholder="e.g. Office closed on 9 November"
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="flex items-center justify-between">
              {errors.title ? (
                <p className="text-xs text-destructive">{errors.title}</p>
              ) : (
                <span />
              )}
              <span className="text-[10px] text-muted-foreground tabular">
                {title.length}/120
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-body">Message</Label>
            <Textarea
              id="ann-body"
              value={body}
              maxLength={2000}
              rows={6}
              placeholder="Write the update — keep it short and clear."
              className="resize-none"
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="flex items-center justify-between">
              {errors.body ? (
                <p className="text-xs text-destructive">{errors.body}</p>
              ) : (
                <span />
              )}
              <span className="text-[10px] text-muted-foreground tabular">
                {body.length}/2000
              </span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button className="rounded-full" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Posting…" : "Post announcement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
