import { AlertCircle, RotateCcw } from "lucide-react";

export default function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-300/20 bg-red-400/[0.08] p-4 text-xs text-red-200"><AlertCircle size={17} className="mt-0.5 shrink-0" /><div><p className="leading-5">{message ?? "Something went wrong. Please try again."}</p><button type="button" onClick={onRetry} className="mt-2 inline-flex items-center gap-1.5 font-semibold hover:text-red-100"><RotateCcw size={12} /> Retry</button></div></div>;
}
