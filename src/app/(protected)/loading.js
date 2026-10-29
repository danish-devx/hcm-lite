import Flower from "@/components/ui/flower-loader";

export default function Loading() {
  return (
    <div className="flower-loading-screen flower-loading-screen--inset">
      <Flower size={120} />
      <p className="flower-loading-label">Loading workspace…</p>
    </div>
  );
}