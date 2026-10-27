"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, CheckCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useGetNotificationsQuery,
  useMarkNotificationsReadMutation,
} from "@/store/api/commsApi";
import { timeAgo } from "./comms-bits";

/**
 * Topbar bell (F24) — unread badge, latest notifications dropdown,
 * item click → mark read + navigate to link. Live: 45s poll + refetchOnFocus.
 */
export function NotificationsBell() {
  const router = useRouter();
  const { data } = useGetNotificationsQuery(undefined, {
    refetchInterval: 45000,
  });
  const [markRead] = useMarkNotificationsReadMutation();

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  function openItem(item) {
    if (!item.is_read) {
      markRead({ ids: [item.id] }).catch(() => {});
    }
    if (item.link && item.link.startsWith("/")) {
      router.push(item.link);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unread ? ` — ${unread} unread` : ""}`}
          className="relative"
        >
          {unread > 0 ? (
            <BellRing className="size-4.5" />
          ) : (
            <Bell className="size-4.5" />
          )}
          {unread > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground tabular">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="micro-label">Notifications</p>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => markRead({ all: true }).catch(() => {})}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          ) : null}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
              <Bell className="size-5 text-muted-foreground/50" />
              <p className="text-sm font-medium">You&rsquo;re all caught up</p>
              <p className="text-xs text-muted-foreground">
                Leave decisions, payslips aur announcements yahan dikhengi.
              </p>
            </div>
          ) : (
            <ul className="py-1">
              {items.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/60",
                      !item.is_read && "bg-primary/[0.045]"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        item.is_read ? "bg-transparent" : "bg-primary"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-[13px] font-medium">
                          {item.title}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground tabular">
                          {timeAgo(item.created_at)}
                        </span>
                      </span>
                      {item.body ? (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                          {item.body}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 ? (
          <div className="border-t px-3 py-2">
            <button
              type="button"
              onClick={() => {
                const unreadIds = items.filter((i) => !i.is_read).map((i) => i.id);
                if (unreadIds.length > 0) {
                  markRead({ ids: unreadIds }).catch(() => {});
                }
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
            >
              Clear unread on this list
            </button>
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
