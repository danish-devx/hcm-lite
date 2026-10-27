"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { LogOut, Menu, Moon, Settings, Sun, UserRound } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { toast } from "sonner";

import { cn, getInitials } from "@/lib/utils";
import { getPageTitle } from "./nav-config";
import { setMobileNavOpen } from "@/store/slices/uiSlice";
import { authApi, useLogoutMutation } from "@/store/api/authApi";
import { NotificationsBell } from "@/components/modules/comms/notifications-bell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* CSS-driven icon swap — hydration-safe without mounted state */}
      <Sun className="size-4.5 dark:hidden" />
      <Moon className="hidden size-4.5 dark:block" />
    </Button>
  );
}

export function Topbar({ profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch();
  const title = getPageTitle(pathname, profile.role);
  const [logout, { isLoading: loggingOut }] = useLogoutMutation();

  async function handleLogout() {
    try {
      await logout().unwrap();
      dispatch(authApi.util.resetApiState());
      toast.success("Signed out. See you soon!");
      router.replace("/login");
    } catch {
      toast.error("Sign out failed. Please try again.");
    }
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation"
        onClick={() => dispatch(setMobileNavOpen(true))}
      >
        <Menu className="size-5" />
      </Button>

      <h1 className="min-w-0 truncate text-sm font-semibold md:text-base">
        {title?.label ?? "Bloom"}
      </h1>

      <div className="ml-auto flex items-center gap-1">
        <NotificationsBell />

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 gap-2 px-2"
              aria-label="Account menu"
            >
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                  {getInitials(profile.full_name)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-28 truncate text-sm font-medium sm:inline">
                {profile.full_name}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="truncate">{profile.full_name}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {profile.email}
              </span>
              <Badge
                variant="secondary"
                className="mt-1 w-fit text-[10px] uppercase tracking-wide"
              >
                {profile.role}
              </Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/profile")}>
              <UserRound className="size-4" /> My Profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/change-password")}>
              <Settings className="size-4" /> Change Password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={loggingOut}
              onSelect={handleLogout}
            >
              <LogOut className="size-4" />
              {loggingOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
