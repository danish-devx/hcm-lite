import { AuthBrandPanel } from "@/components/layout/auth-brand-panel";

export default function PublicLayout({ children }) {
  return (
    <div className="grid min-h-svh w-full lg:grid-cols-[1fr_1.05fr]">
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">{children}</div>
      </div>
      <AuthBrandPanel />
    </div>
  );
}
