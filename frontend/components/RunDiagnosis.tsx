"use client";

import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle, PlugZap, Sparkles } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Diagnosis } from "@/lib/types";
import ErrorState from "./ErrorState";

export default function RunDiagnosis({
  sessionId,
  onDone,
}: {
  sessionId: number;
  onDone: () => void;
}) {
  const key = useRef<string | undefined>(undefined);
  const run = useMutation({
    mutationFn: () =>
      api<Diagnosis>("/diagnosis/", {
        method: "POST",
        headers: {
          "Idempotency-Key": key.current ?? (key.current = crypto.randomUUID()),
        },
        body: JSON.stringify({ session_id: sessionId }),
      }),
    onSuccess: onDone,
  });
  const unconfigured =
    run.error instanceof ApiError && run.error.code === "ai_not_configured";
  return (
    <div className="px-4 pt-3 md:px-7">
      {unconfigured ? (
        <div
          role="status"
          className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
        >
          <PlugZap size={20} className="shrink-0 text-amber-600" />
          <div>
            <h3 className="text-xs font-semibold text-amber-900">
              AI diagnosis isn’t connected yet
            </h3>
            <p className="mt-1 text-[11px] leading-5 text-amber-800">
              Your conversation is saved. The app owner needs to add the AI
              provider key and restart the backend before you can run a
              diagnosis.
            </p>
            <button
              onClick={() => run.mutate()}
              disabled={run.isPending}
              className="mt-2 text-[11px] font-semibold text-amber-900 underline"
            >
              Check connection again
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-100 bg-[#fff6ef] p-4">
            <div className="flex items-center gap-3">
              <Sparkles size={19} className="text-orange-600" />
              <div>
                <p className="text-xs font-semibold text-slate-800">
                  Ready for a clearer picture?
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  Your intake is complete. Let’s review the possibilities.
                </p>
              </div>
            </div>
            <button
              onClick={() => run.mutate()}
              disabled={run.isPending}
              className="btn-primary px-4 py-2.5 text-xs"
            >
              {run.isPending ? (
                <>
                  <LoaderCircle size={14} className="animate-spin" /> Analyzing…
                </>
              ) : (
                <>
                  Run diagnosis <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
          {run.isError && (
            <div className="mt-2">
              <ErrorState
                message={run.error.message}
                onRetry={() => run.mutate()}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
