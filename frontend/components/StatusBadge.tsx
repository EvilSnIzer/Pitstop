import type { Session } from "@/lib/types";

export default function StatusBadge({ status }: { status: Session["status"] }) {
  const label =
    status === "in_progress"
      ? "In progress"
      : status === "diagnosed"
        ? "Diagnosed"
        : "Booking requested";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${status === "in_progress" ? "bg-orange-50 text-orange-700" : status === "diagnosed" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}
    >
      <span className="h-1 w-1 rounded-full bg-current" />
      {label}
    </span>
  );
}
