"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { ChevronDown } from "lucide-react";

import { cn, getInitials } from "@/lib/utils";
import { getNavForRole } from "./nav-config";
import { setMobileNavOpen } from "@/store/slices/uiSlice";
import { Logo } from "./logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

function isActive(pathname, href) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Editorial numbered link — pic ke "01 / 24 / 42" markers ki tarah
 * icon ki jagah two-digit index, active state me terracotta indicator bar.
 */
function NavLink({ item, index, pathname, onNavigate }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-primary before:absolute before:top-1/2 before:left-0 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      )}
    >
      <span
        className={cn(
          "w-5 shrink-0 text-[11px] font-semibold tabular",
          active ? "text-primary" : "text-muted-foreground/60"
        )}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="truncate">{item.label}</span>
      {item.phase ? (
        <span className="ml-auto rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          P{item.phase}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarNav({ role, pathname, onNavigate }) {
  const items = getNavForRole(role);

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {items.map((item, index) =>
        item.children ? (
          <NavGroup
            key={item.href}
            item={item}
            index={index}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ) : (
          <NavLink
            key={item.href}
            item={item}
            index={index}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        )
      )}
    </nav>
  );
}

function NavGroup({ item, index, pathname, onNavigate }) {
  const groupActive = item.children.some((c) => isActive(pathname, c.href));
  const [open, setOpen] = React.useState(groupActive);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          groupActive
            ? "text-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        )}
      >
        <span className="w-5 shrink-0 text-[11px] font-semibold text-muted-foreground/60 tabular">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="truncate">{item.label}</span>
        {item.phase ? (
          <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            P{item.phase}
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            "ml-auto size-3.5 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <div className="ml-3 space-y-0.5 border-l pl-3">
          {item.children.map((child, childIndex) => (
            <NavLink
              key={child.href}
              item={{ ...child, phase: null }}
              index={childIndex}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SidebarBody({ profile, pathname, onNavigate }) {
  return (
    <>
      <div className="px-5 pt-5">
        <Logo />
      </div>
      <Separator className="mt-4" />
      <SidebarNav role={profile.role} pathname={pathname} onNavigate={onNavigate} />
      <Separator />
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
            {getInitials(profile.full_name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{profile.full_name}</div>
          <Badge
            variant="secondary"
            className="mt-0.5 h-5 px-1.5 text-[10px] uppercase tracking-wide"
          >
            {profile.role}
          </Badge>
        </div>
      </div>
    </>
  );
}

export function AppSidebar({ profile }) {
  const pathname = usePathname();
  const dispatch = useDispatch();
  const mobileNavOpen = useSelector((state) => state.ui.mobileNavOpen);

  const close = () => dispatch(setMobileNavOpen(false));

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
        <SidebarBody profile={profile} pathname={pathname} />
      </aside>

      {/* Mobile sheet */}
      <Sheet open={mobileNavOpen} onOpenChange={(v) => dispatch(setMobileNavOpen(v))}>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col">
            <SidebarBody profile={profile} pathname={pathname} onNavigate={close} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
