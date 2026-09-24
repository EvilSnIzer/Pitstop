"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import ErrorState from "@/components/ErrorState";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { isAuthed } from "@/lib/auth";
import type { Paginated, Session } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const authed = useQuery({
    queryKey: ["auth"],
    queryFn: () => isAuthed(),
    staleTime: Infinity,
  });
  useEffect(() => {
    if (authed.data === false) router.replace("/login");
  }, [authed.data, router]);
  const sessions = useQuery({
    queryKey: ["sessions", page, filter, search],
    queryFn: ({ signal }) =>
      api<Paginated<Session>>(
        `/sessions/?page=${page}${filter === "all" ? "" : `&status=${filter}`}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
        { signal },
      ),
    enabled: authed.data === true,
  });
  const newChat = useMutation({
    mutationFn: () =>
      api<Session>("/sessions/", { method: "POST", body: "{}" }),
    onSuccess: async (session) => {
      // An initial list request can finish after creation with a stale empty snapshot.
      await queryClient.cancelQueries({ queryKey: ["sessions"] });
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      router.push(`/chat/${session.id}`);
    },
  });
  if (authed.isError)
    return (
      <div className="mx-auto max-w-lg p-8">
        <ErrorState
          message={authed.error.message}
          onRetry={() => authed.refetch()}
        />
      </div>
    );
  if (authed.data !== true)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-500">
        Opening your workspace…
        {process.env.NEXT_PUBLIC_DIRECT_API_URL && (
          <p className="max-w-sm text-xs">
            First visit? The free backend may take about a minute to wake up.
          </p>
        )}
      </div>
    );
  const visible = sessions.data?.results;

  return (
    <AppShell>
      <main className="flex-1 overflow-y-auto px-5 py-7 md:px-9 md:py-9">
        <div className="mx-auto max-w-[1260px]">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow mb-2 text-[#bd603e]">
                Less guesswork. More confidence.
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.045em] md:text-4xl">
                Good to see you.
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Let’s get you and your car back on the same page.
              </p>
            </div>
            <span className="text-xs text-slate-500">
              Your personal car-care workspace
            </span>
          </div>
          <section className="relative isolate min-h-[300px] overflow-hidden rounded-2xl bg-[#1e2428] px-7 py-8 text-white md:px-9">
            <Image
              src="/garage.jpg"
              alt="Silver coupe in a softly lit garage"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 75vw"
              className="-z-20 object-cover object-[65%_65%]"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#1d2227] via-[#1d2227]/85 to-transparent" />
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-medium tracking-wide text-orange-100">
              <Sparkles size={12} className="text-orange-300" /> MEET YOUR
              VIRTUAL MECHANIC
            </span>
            <h2 className="mt-5 max-w-sm text-3xl font-medium leading-[1.18] tracking-[-0.04em] md:text-[38px]">
              Car trouble?
              <br />
              <span className="text-[#f3b299]">Let’s figure it out.</span>
            </h2>
            <p className="mt-4 max-w-[290px] text-xs leading-6 text-slate-300">
              Describe a noise, share a photo, or tell us what feels off. We’ll
              help you find your next step.
            </p>
            <button
              onClick={() => newChat.mutate()}
              disabled={newChat.isPending}
              className="btn-primary mt-6"
            >
              {newChat.isPending ? "Opening workspace…" : "New conversation"}
              <ArrowUpRight size={17} />
            </button>
            <span className="absolute bottom-6 right-7 hidden text-[9px] tracking-[0.2em] text-white/50 md:block">
              BUILT AROUND YOUR DRIVE
            </span>
          </section>
          {newChat.isError && (
            <div className="mt-4">
              <ErrorState
                message={newChat.error.message}
                onRetry={() => newChat.mutate()}
              />
            </div>
          )}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="panel flex items-center gap-3 p-4">
              <span className="rounded-xl bg-orange-50 p-2.5 text-orange-600">
                <MessageSquare size={19} />
              </span>
              <div>
                <p className="text-xs font-semibold">
                  Start with a conversation
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  No technical knowledge needed
                </p>
              </div>
            </div>
            <div className="panel flex items-center gap-3 p-4">
              <span className="rounded-xl bg-blue-50 p-2.5 text-blue-500">
                <Camera size={19} />
              </span>
              <div>
                <p className="text-xs font-semibold">
                  Show us what’s happening
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Photos, audio & video supported
                </p>
              </div>
            </div>
            <div className="panel flex items-center gap-3 p-4">
              <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
                <Wrench size={19} />
              </span>
              <div>
                <p className="text-xs font-semibold">Know your next step</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Guidance before a repair decision
                </p>
              </div>
            </div>
          </div>
          <div className="mt-9 grid gap-6 xl:grid-cols-[1fr_290px]">
            <section id="conversations" className="min-w-0 scroll-mt-5">
              <div className="mb-4 flex items-center justify-between">
                <h2
                  aria-label="Conversations"
                  className="text-lg font-semibold tracking-tight"
                >
                  Conversations{" "}
                  <span className="ml-1 rounded-md bg-slate-200/70 px-1.5 py-0.5 align-middle text-[10px] font-medium text-slate-500">
                    {sessions.data?.count ?? "—"}
                  </span>
                </h2>
                <button
                  onClick={() => newChat.mutate()}
                  disabled={newChat.isPending}
                  aria-label="Create another conversation"
                  className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-orange-600"
                >
                  <Plus size={19} />
                </button>
              </div>
              <div className="panel overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
                  <div className="flex gap-1 rounded-lg bg-slate-100/80 p-1">
                    {[
                      ["all", "All"],
                      ["in_progress", "In progress"],
                      ["diagnosed", "Diagnosed"],
                      ["booked", "Booked"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => (setFilter(value), setPage(1))}
                        className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium ${filter === value ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-slate-500">
                    <Search size={14} />
                    <input
                      aria-label="Search conversations"
                      value={search}
                      onChange={(e) => (setSearch(e.target.value), setPage(1))}
                      placeholder="Find by number…"
                      className="w-28 bg-transparent text-xs outline-none"
                    />
                  </label>
                </div>
                {sessions.isLoading && (
                  <div
                    className="space-y-3 p-5"
                    aria-label="Loading conversations"
                  >
                    {[1, 2, 3].map((n) => (
                      <div
                        key={n}
                        className="h-14 animate-pulse rounded-xl bg-slate-100"
                      />
                    ))}
                  </div>
                )}
                {sessions.isError && (
                  <div className="p-4">
                    <ErrorState
                      message={sessions.error.message}
                      onRetry={() => sessions.refetch()}
                    />
                  </div>
                )}
                {visible?.map((s) => (
                  <Link
                    key={s.id}
                    href={`/chat/${s.id}`}
                    className="group flex items-center gap-3 border-b border-slate-100 p-5 last:border-b-0 hover:bg-slate-50"
                  >
                    <span className="rounded-xl border border-slate-200 p-2.5 text-slate-500 group-hover:border-orange-200 group-hover:text-orange-500">
                      <MessageSquare size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">
                        Conversation #{s.id}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        Updated{" "}
                        {new Date(s.updated_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <StatusBadge status={s.status} />
                    <ChevronRight size={15} className="text-slate-300" />
                  </Link>
                ))}
                {visible?.length === 0 && (
                  <div className="px-6 py-10 text-center">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
                      <MessageSquare size={22} />
                    </span>
                    <p className="mt-4 text-sm font-medium">
                      {!search && filter === "all" && sessions.data?.count === 0
                        ? "No conversations yet."
                        : "No matching conversations."}
                    </p>
                    <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-slate-500">
                      Start a conversation and we’ll keep your car’s story here,
                      ready whenever you need it.
                    </p>
                  </div>
                )}
                {sessions.data &&
                  (sessions.data.next || sessions.data.previous) && (
                    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                      <button
                        aria-label="Previous page"
                        disabled={!sessions.data.previous}
                        onClick={() => setPage((p) => p - 1)}
                        className="rounded p-2 disabled:opacity-30"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      Page {page}
                      <button
                        aria-label="Next page"
                        disabled={!sessions.data.next}
                        onClick={() => setPage((p) => p + 1)}
                        className="rounded p-2 disabled:opacity-30"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
              </div>
            </section>
            <aside id="how-it-works" className="scroll-mt-5">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold tracking-tight">
                A clearer road ahead{" "}
                <ArrowUpRight size={16} className="text-slate-500" />
              </h2>
              <div className="panel p-5">
                {[
                  [
                    "01",
                    "Tell us the symptoms",
                    "A sound, a warning light, or just a feeling.",
                  ],
                  [
                    "02",
                    "Get a clearer picture",
                    "Answer a few questions, then run a diagnosis.",
                  ],
                  [
                    "03",
                    "Take the next step",
                    "Review the recommendation and request a mechanic.",
                  ],
                ].map(([num, title, text], i) => (
                  <div
                    key={num}
                    className={`flex gap-3 ${i < 2 ? "mb-6" : ""}`}
                  >
                    <span className="mt-0.5 text-[10px] font-semibold text-orange-500">
                      {num}
                    </span>
                    <div>
                      <p className="text-xs font-semibold">{title}</p>
                      <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
                        {text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 flex gap-2 px-1 text-[10px] leading-5 text-slate-500">
                <CircleHelp size={14} className="mt-0.5 shrink-0" />
                AI analysis requires a configured provider. Chat intake and
                saved history work independently.
              </p>
            </aside>
          </div>
          <footer className="mt-10 flex items-center justify-between border-t border-slate-200/70 py-5 text-[10px] text-slate-500">
            <span>Thoughtful care. Every kilometre.</span>
            <span>PITSTOP / YOUR DRIVE, UNDERSTOOD</span>
          </footer>
        </div>
      </main>
    </AppShell>
  );
}
