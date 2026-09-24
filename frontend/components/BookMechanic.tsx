"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, LoaderCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { Booking } from "@/lib/types";
import ErrorState from "./ErrorState";

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function BookMechanic({
  sessionId,
  onDone,
}: {
  sessionId: number;
  onDone: () => void;
}) {
  const [when, setWhen] = useState("");
  const key = useRef({ time: "", value: "" });
  const book = useMutation({
    mutationFn: (scheduledAt: string) => {
      if (key.current.time !== scheduledAt)
        key.current = { time: scheduledAt, value: crypto.randomUUID() };
      return api<Booking>("/booking/", {
        method: "POST",
        headers: { "Idempotency-Key": key.current.value },
        body: JSON.stringify({
          session_id: sessionId,
          scheduled_at: scheduledAt,
        }),
      });
    },
    onSuccess: onDone,
  });
  function submit() {
    if (when && !book.isPending) book.mutate(new Date(when).toISOString());
  }
  return (
    <div className="px-4 pt-3 md:px-7">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <CalendarDays size={17} className="text-orange-600" />
          <h2 className="text-xs font-semibold">
            Ready to speak to a mechanic?
          </h2>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-slate-500">
          Choose your preferred time. This creates a booking request;
          confirmation is handled separately.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <label className="min-w-0 flex-1 text-[10px] font-semibold text-slate-500">
            Preferred time (your local timezone)
            <input
              aria-label="Preferred booking time"
              type="datetime-local"
              required
              min={toLocalInputValue(new Date())}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="field mt-1 min-w-0 py-2 text-xs"
            />
          </label>
          <button
            type="submit"
            disabled={!when || book.isPending}
            className="btn-primary py-2.5 text-xs"
          >
            {book.isPending ? (
              <>
                <LoaderCircle size={14} className="animate-spin" /> Requesting…
              </>
            ) : (
              <>
                Book mechanic <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>
        {book.isError && (
          <div className="mt-3">
            <ErrorState message={book.error.message} onRetry={submit} />
          </div>
        )}
      </div>
    </div>
  );
}
