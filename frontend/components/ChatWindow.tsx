"use client";

import { useEffect, useRef } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  FileCheck2,
  LoaderCircle,
  Wrench,
} from "lucide-react";
import type { History } from "@/lib/types";
import BookMechanic from "./BookMechanic";
import Composer from "./Composer";
import ErrorState from "./ErrorState";
import MessageBubble from "./MessageBubble";
import RunDiagnosis from "./RunDiagnosis";

export default function ChatWindow({
  history,
  sending,
  sendError,
  onSend,
  onRetry,
  onDiagnosisDone,
  onBookingDone,
  pendingText,
  hasOlder,
  loadingOlder,
  onLoadOlder,
}: {
  history: History;
  sending: boolean;
  sendError: string | null;
  onSend: (input: {
    content: string;
    media_id?: number;
    request_id: string;
  }) => Promise<void>;
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
  useEffect(() => {
    scroll.current?.scrollTo({
      top: scroll.current.scrollHeight,
      behavior: "smooth",
    });
  }, [lastMessageId, sending, diagnosis, booking]);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={scroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-7"
      >
        {hasOlder && (
          <button
            onClick={onLoadOlder}
            disabled={loadingOlder}
            className="btn-secondary mb-4 w-full text-xs"
          >
            {loadingOlder
              ? "Loading earlier messages…"
              : "Load earlier messages"}
          </button>
        )}
        <div className="mb-7 flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200/70" />
          <span className="text-[9px] uppercase tracking-wider text-slate-500">
            {new Date(session.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}{" "}
            · The start of a better drive
          </span>
          <span className="h-px flex-1 bg-slate-200/70" />
        </div>
        <div className="space-y-6">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </div>
        {messages.length === 1 && (
          <div className="ml-11 mt-5 rounded-xl border border-dashed border-slate-200 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              A good place to start
            </p>
            <p className="mt-2 text-xs leading-6 text-slate-500">
              Tell me your car’s make and year, what you’ve noticed, and when it
              started. You can also attach a photo or a recording.
            </p>
          </div>
        )}
        {sending && (
          <div className="ml-auto mt-4 max-w-[85%] rounded-2xl bg-slate-200 p-4 text-xs text-slate-600">
            <p className="whitespace-pre-wrap">{pendingText}</p>
            <span className="mt-2 block text-[10px]">Sending…</span>
          </div>
        )}
        {sending && (
          <div
            role="status"
            className="mt-6 flex items-center gap-2 text-xs text-slate-500"
          >
            <LoaderCircle size={14} className="animate-spin text-orange-500" />{" "}
            Your mechanic is reviewing…
          </div>
        )}
        {diagnosis && (
          <article className="mt-7 overflow-hidden rounded-2xl border border-emerald-200 bg-white">
            <div className="flex items-center justify-between bg-emerald-50 px-5 py-3">
              <span className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                <FileCheck2 size={16} /> Diagnostic assessment
              </span>
              <CheckCircle2 size={15} className="text-emerald-600" />
            </div>
            <div className="p-5">
              <h2 className="text-base font-semibold tracking-tight">
                Here’s what we found
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-xs leading-7 text-slate-600">
                {diagnosis.summary}
              </p>
              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <p className="eyebrow mb-2">Recommended next step</p>
                <p className="flex items-start gap-2 text-xs font-medium leading-6">
                  <Wrench size={15} className="mt-1 shrink-0 text-orange-600" />
                  {diagnosis.recommended_service}
                </p>
              </div>
              <p className="mt-4 text-[10px] leading-5 text-slate-500">
                Model-reported confidence:{" "}
                {Math.round(diagnosis.confidence * 100)}%. This is not a
                verified probability or a substitute for an in-person
                inspection.
              </p>
            </div>
          </article>
        )}
        {booking && (
          <article className="mt-5 flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <CalendarCheck size={22} className="shrink-0 text-blue-600" />
            <div>
              <h2 className="text-sm font-semibold text-blue-950">
                {booking.status === "confirmed"
                  ? "Booking confirmed"
                  : booking.status === "cancelled"
                    ? "Booking cancelled"
                    : "Booking request received"}
              </h2>
              <p className="mt-2 text-xs text-blue-900">
                {new Date(booking.scheduled_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <p className="mt-2 text-[11px] text-blue-700">
                Reference #{booking.id} ·{" "}
                {booking.status === "pending"
                  ? "Pending confirmation"
                  : booking.status}
              </p>
            </div>
          </article>
        )}
      </div>
      <div className="max-h-[45%] shrink-0 overflow-y-auto">
        {sendError && (
          <div className="px-4 pt-3 md:px-7">
            <ErrorState message={sendError} onRetry={onRetry} />
          </div>
        )}
        {session.status === "in_progress" && session.diagnosis_ready && (
          <RunDiagnosis sessionId={session.id} onDone={onDiagnosisDone} />
        )}
        {session.status === "diagnosed" && (
          <BookMechanic sessionId={session.id} onDone={onBookingDone} />
        )}
      </div>
      <Composer onSend={onSend} disabled={sending} />
    </div>
  );
}
