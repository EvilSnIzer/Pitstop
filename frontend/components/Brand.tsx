import { Cpu } from "lucide-react";

export default function Brand({ light = false }: { light?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-3 ${light ? "text-white" : "text-slate-100"}`}
    >
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#ff6b3d] text-white shadow-[0_0_22px_-5px_rgba(255,107,61,.9)]">
        <span className="absolute inset-0 rounded-xl border border-white/30" />
        <Cpu size={18} strokeWidth={2.2} />
      </span>
      <span>
        <span className="block text-[18px] font-black leading-none tracking-[-0.07em]">
          pitstop<span className="text-[#ff6b3d]">.</span>
        </span>
        <span className="mt-1 block text-[8px] font-bold uppercase tracking-[0.24em] text-slate-500">
          vehicle intelligence
        </span>
      </span>
    </span>
  );
}
