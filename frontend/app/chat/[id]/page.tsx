"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CheckCircle2, ClipboardList, Info, MessageSquare, ShieldCheck, Sparkles, Wrench, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useDialogFocus } from "@/lib/useDialogFocus";
import AppShell from "@/components/AppShell";
import ChatWindow from "@/components/ChatWindow";
import ErrorState from "@/components/ErrorState";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/api";
import type { History, Message, Session } from "@/lib/types";

type SendInput = { content: string; media_id?: number; request_id: string };

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const sessionId = Number(id);
  const validId = Number.isInteger(sessionId) && sessionId > 0;
  const [lastInput, setLastInput] = useState<SendInput | null>(null);
  const [details, setDetails] = useState(false);
  const detailsPanel = useRef<HTMLElement>(null);
  useDialogFocus(details, detailsPanel, () => setDetails(false));
  const history = useInfiniteQuery({ queryKey: ["history", sessionId], initialPageParam: undefined as number | undefined, queryFn: ({ pageParam }) => api<History>(`/sessions/${sessionId}/history/${pageParam ? `?before=${pageParam}` : ""}`), getNextPageParam: (last) => last.older_cursor ?? undefined, enabled: validId });
  const send = useMutation({ mutationFn: (input: SendInput) => api<{ message: Message; session: Session }>("/chat/", { method: "POST", headers: { "Idempotency-Key": input.request_id }, body: JSON.stringify({ session_id: sessionId, content: input.content, media_id: input.media_id }) }), onSuccess: () => history.refetch() });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["history", sessionId] }); queryClient.invalidateQueries({ queryKey: ["sessions"] }); };
  if (!validId) return <AppShell><p className="p-8 text-sm text-slate-400">Invalid conversation. <Link href="/" className="text-orange-300">Return to overview</Link></p></AppShell>;
  if (history.isLoading) return <AppShell><div className="flex-1 animate-pulse space-y-5 bg-[#080a12] p-8"><div className="h-10 w-48 rounded-xl bg-white/[0.06]" /><div className="h-24 max-w-md rounded-xl bg-white/[0.04]" /><p className="text-xs text-slate-500">Opening diagnostic channel…</p></div></AppShell>;
  if (history.isError || !history.data) return <AppShell><div className="bg-[#080a12] p-7"><ErrorState message={history.error?.message} onRetry={() => history.refetch()} /></div></AppShell>;
  const latest = history.data.pages[0];
  const messages = Array.from(new Map(history.data.pages.flatMap((p) => p.messages).map((m) => [m.id, m])).values()).sort((a, b) => a.id - b.id);
  const { session, booking } = latest;
  const intakeDone = session.diagnosis_ready || session.status !== "in_progress";
  const diagnosisDone = session.status !== "in_progress";
  const steps: { done: boolean; title: string; text: string; icon: LucideIcon }[] = [
    { done: intakeDone, title: "Understand the issue", text: intakeDone ? "Intake complete" : "Share symptoms and vehicle details", icon: MessageSquare },
    { done: diagnosisDone, title: "Review the diagnosis", text: diagnosisDone ? "Assessment available" : intakeDone ? "Ready when you are" : "Available after intake", icon: Sparkles },
    { done: Boolean(booking), title: "Plan your next step", text: booking ? `Booking ${booking.status}` : "Optional mechanic booking", icon: Wrench },
  ];
  return <AppShell><div className="flex min-h-0 flex-1 flex-col bg-[#080a12]">
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-[#0a0d15]/90 px-5 py-5 backdrop-blur-xl md:px-8"><div className="flex items-center gap-3"><Link href="/" aria-label="All conversations" className="rounded-lg border border-white/10 p-2 text-slate-500 hover:border-orange-300/30 hover:text-orange-300"><ArrowLeft size={16} /></Link><div><div className="flex items-center gap-2"><h1 className="text-sm font-semibold tracking-tight text-white">Diagnostic channel</h1><span className="hidden items-center gap-1.5 rounded border border-violet-300/20 bg-violet-400/[0.08] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300 sm:flex"><Sparkles size={10} /> AI core</span></div><p className="mt-1 font-mono text-[10px] text-slate-600">THREAD #{session.id} · ENCRYPTED INTAKE</p></div></div><div className="flex items-center gap-2"><StatusBadge status={session.status} /><button onClick={() => setDetails(!details)} aria-label="Session details" aria-expanded={details} aria-controls="session-details" className="rounded-lg border border-white/10 p-2 text-slate-500 hover:bg-white/[0.05] hover:text-slate-200 xl:hidden"><Info size={17} /></button></div></header>
    <div className="relative flex min-h-0 flex-1"><ChatWindow history={{ ...latest, messages }} pendingText={send.isPending ? (lastInput?.content ?? "Attachment") : undefined} hasOlder={history.hasNextPage} loadingOlder={history.isFetchingNextPage} onLoadOlder={() => history.fetchNextPage()} sending={send.isPending} sendError={send.isError ? send.error.message : null} onSend={async (input) => { setLastInput(input); await send.mutateAsync(input); queryClient.invalidateQueries({ queryKey: ["sessions"] }); }} onRetry={() => { if (lastInput) send.mutate(lastInput); }} onDiagnosisDone={refresh} onBookingDone={refresh} />
      {details && <button aria-label="Close session details" onClick={() => setDetails(false)} className="absolute inset-0 z-10 bg-black/50 xl:hidden" />}
      <aside ref={detailsPanel} id="session-details" role={details ? "dialog" : undefined} aria-modal={details || undefined} aria-label="Session details" className={`${details ? "absolute inset-y-0 right-0 z-20 block shadow-xl" : "hidden"} w-[290px] shrink-0 overflow-y-auto border-l border-white/[0.08] bg-[#0c101a] p-6 xl:static xl:block xl:shadow-none`}>
        <div className="mb-6 flex items-center justify-between"><h2 className="eyebrow text-violet-300/70">Session details</h2><button onClick={() => setDetails(false)} aria-label="Hide details" className="text-slate-500 hover:text-white xl:hidden"><X size={15} /></button><ClipboardList size={15} className="hidden text-slate-600 xl:block" /></div>
        <div className="mb-7 rounded-2xl border border-violet-300/15 bg-gradient-to-br from-violet-400/[0.1] to-transparent p-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-300/20 bg-orange-400/[0.08] text-orange-300"><Wrench size={19} /></span><p className="mt-3 text-sm font-semibold text-white">Your diagnostic journey</p><p className="mt-1 text-[11px] leading-5 text-slate-600">A live signal map from symptom to next move.</p></div>
        <div className="space-y-6">{steps.map((step, index) => <div className="flex gap-3" key={step.title}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${step.done ? "bg-[#b7f36b]/[0.1] text-[#b7f36b]" : index === 0 ? "bg-orange-400/[0.1] text-orange-300" : "bg-white/[0.06] text-slate-500"}`}>{step.done ? <Check size={14} /> : <step.icon size={13} />}</span><div><h3 className="text-xs font-semibold text-slate-200">{step.title}</h3><p className="mt-1 text-[10px] leading-5 text-slate-600">{step.text}</p></div></div>)}</div>
        <div className="my-7 space-y-3 border-y border-white/[0.08] py-5"><div className="flex justify-between text-[10px]"><span className="text-slate-600">Session reference</span><span className="font-medium text-slate-300">#{session.id}</span></div><div className="flex justify-between text-[10px]"><span className="text-slate-600">Messages saved</span><span className="font-medium text-slate-300">{messages.length}</span></div><div className="flex items-center gap-1.5 text-[10px] text-[#b7f36b]"><CheckCircle2 size={12} /> Conversation saved to your account</div></div>
        <div className="rounded-xl border border-orange-300/15 bg-orange-400/[0.06] p-4"><ShieldCheck size={18} className="text-orange-300" /><h3 className="mt-2 text-xs font-semibold text-slate-200">Safety comes first.</h3><p className="mt-2 text-[11px] leading-5 text-slate-500">If you notice smoke, overheating, or trouble braking, stop somewhere safe and seek roadside assistance.</p></div>
      </aside>
    </div>
  </div></AppShell>;
}
