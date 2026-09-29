"use client";

import { useEffect, useRef } from "react";
import { CalendarCheck, CheckCircle2, FileCheck2, LoaderCircle, Wrench } from "lucide-react";
import type { History } from "@/lib/types";
import BookMechanic from "./BookMechanic";
import Composer from "./Composer";
import ErrorState from "./ErrorState";
import MessageBubble from "./MessageBubble";
import RunDiagnosis from "./RunDiagnosis";

export default function ChatWindow({ history, sending, sendError, onSend, onRetry, onDiagnosisDone, onBookingDone, pendingText, hasOlder, loadingOlder, onLoadOlder }: {
  history: History;
  sending: boolean;
  sendError: string | null;
  onSend: (input: { content: string; media_id?: number; request_id: string }) => Promise<void>;
  pendingText?: string;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onRetry: () => void;
  onDiagnosisDone: () => void;
  onBookingDone: () => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const { session, messages, diagnosis, booking } = history;
  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" }); }, [lastMessageId, sending, diagnosis, booking]);
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#080a12]">
    <div ref={scroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
      {hasOlder && <button onClick={onLoadOlder} disabled={loadingOlder} className="btn-secondary mb-5 w-full text-xs">{loadingOlder ? "Loading earlier messages…" : "Load earlier messages"}</button>}
      <div className="mb-8 flex items-center gap-3"><span className="h-px flex-1 bg-white/[0.08]" /><span className="font-mono text-[9px] uppercase tracking-wider text-slate-600">{new Date(session.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · intake channel open</span><span className="h-px flex-1 bg-white/[0.08]" /></div>
      <div className="mx-auto max-w-3xl space-y-6">{messages.map((m) => <MessageBubble key={m.id} message={m} />)}</div>
      {messages.length === 1 && <div className="mx-auto ml-11 mt-6 max-w-3xl rounded-2xl border border-dashed border-violet-300/20 bg-violet-400/[0.035] p-5 md:ml-11"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300">A good place to start</p><p className="mt-2 text-xs leading-6 text-slate-500">Tell me your car’s make and year, what you’ve noticed, and when it started. You can also attach a photo or a recording.</p></div>}
      {sending && <div className="ml-auto mt-4 max-w-[85%] rounded-2xl border border-violet-300/20 bg-violet-400/[0.1] p-4 text-xs text-slate-300"><p className="whitespace-pre-wrap">{pendingText}</p><span className="mt-2 block text-[10px] text-slate-500">Transmitting signal…</span></div>}
      {sending && <div role="status" className="mt-6 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle size={14} className="animate-spin text-orange-400" /> Your mechanic is reviewing…</div>}
      {diagnosis && <article className="mx-auto mt-8 max-w-3xl overflow-hidden rounded-2xl border border-[#b7f36b]/20 bg-[#b7f36b]/[0.035]"><div className="flex items-center justify-between border-b border-[#b7f36b]/15 bg-[#b7f36b]/[0.06] px-5 py-3"><span className="flex items-center gap-2 text-xs font-semibold text-[#b7f36b]"><FileCheck2 size={16} /> Diagnostic assessment</span><CheckCircle2 size={15} className="text-[#b7f36b]" /></div><div className="p-5"><h2 className="text-base font-semibold tracking-tight text-white">Here’s what we found</h2><p className="mt-3 whitespace-pre-wrap text-xs leading-7 text-slate-400">{diagnosis.summary}</p><div className="mt-5 rounded-xl border border-white/[0.08] bg-black/20 p-4"><p className="eyebrow mb-2 text-orange-300">Recommended next step</p><p className="flex items-start gap-2 text-xs font-medium leading-6 text-slate-200"><Wrench size={15} className="mt-1 shrink-0 text-orange-400" />{diagnosis.recommended_service}</p></div><p className="mt-4 text-[10px] leading-5 text-slate-600">Model-reported confidence: {Math.round(diagnosis.confidence * 100)}%. This is not a verified probability or a substitute for an in-person inspection.</p></div></article>}
      {booking && <article className="mx-auto mt-5 flex max-w-3xl gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.06] p-5"><CalendarCheck size={22} className="shrink-0 text-cyan-300" /><div><h2 className="text-sm font-semibold text-cyan-100">{booking.status === "confirmed" ? "Booking confirmed" : booking.status === "cancelled" ? "Booking cancelled" : "Booking request received"}</h2><p className="mt-2 text-xs text-cyan-100/80">{new Date(booking.scheduled_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p><p className="mt-2 text-[11px] text-cyan-200/60">Reference #{booking.id} · {booking.status === "pending" ? "Pending confirmation" : booking.status}</p></div></article>}
    </div>
    <div className="max-h-[45%] shrink-0 overflow-y-auto">{sendError && <div className="px-4 pt-3 md:px-8"><ErrorState message={sendError} onRetry={onRetry} /></div>}{session.status === "in_progress" && session.diagnosis_ready && <RunDiagnosis sessionId={session.id} onDone={onDiagnosisDone} />}{session.status === "diagnosed" && <BookMechanic sessionId={session.id} onDone={onBookingDone} />}</div>
    <Composer onSend={onSend} disabled={sending} />
  </div>;
}
