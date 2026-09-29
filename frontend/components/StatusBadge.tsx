import type { Session } from "@/lib/types";

export default function StatusBadge({ status }: { status: Session["status"] }) {
  const label = status === "in_progress" ? "In progress" : status === "diagnosed" ? "Diagnosed" : "Booking requested";
  const tone = status === "in_progress" ? "border-orange-300/20 bg-orange-400/[0.08] text-orange-300" : status === "diagnosed" ? "border-[#b7f36b]/20 bg-[#b7f36b]/[0.07] text-[#b7f36b]" : "border-cyan-300/20 bg-cyan-400/[0.07] text-cyan-300";
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${tone}`}><span className="h-1 w-1 rounded-full bg-current shadow-[0_0_6px_currentColor]" />{label}</span>;
}
