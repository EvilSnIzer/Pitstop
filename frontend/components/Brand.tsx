import { Wrench } from "lucide-react";

export default function Brand({ light = false }: { light?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 ${light ? "text-white" : "text-slate-900"}`}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ed623a] text-white">
        <Wrench size={19} strokeWidth={2.4} />
      </span>
      <span className="text-xl font-extrabold tracking-[-0.06em]">
        pitstop<span className="text-[#ed623a]">.</span>
      </span>
    </span>
  );
}
