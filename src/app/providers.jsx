"use client";

import { Provider } from "react-redux";

import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { store } from "@/store";

export function Providers({ children }) {
  return (
    <Provider store={store}>
      <ThemeProvider defaultTheme="system">
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </Provider>
  );
}
