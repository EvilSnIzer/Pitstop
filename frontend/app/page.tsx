"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  AudioLines,
  Bot,
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Cpu,
  MessageSquare,
  Plus,
  Radar,
  Search,
  Sparkles,
  Terminal,
  Wrench,
  Zap,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import ErrorState from "@/components/ErrorState";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { isAuthed } from "@/lib/auth";
import type { Paginated, Session } from "@/lib/types";

function SignalBar({ value, tone = "orange" }: { value: number; tone?: "orange" | "violet" | "lime" }) {
  return (
    <div className="flex items-end gap-0.5" aria-hidden="true">
      {[.35, .55, .75, 1, .65, .9, .5].map((height, index) => (
        <span key={index} style={{ height: `${height * 18}px` }} className={`w-1 rounded-full ${index / 7 < value ? tone === "violet" ? "bg-violet-300" : tone === "lime" ? "bg-[#b7f36b]" : "bg-orange-400" : "bg-white/10"}`} />
      ))}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const authed = useQuery({ queryKey: ["auth"], queryFn: () => isAuthed(), staleTime: Infinity });
  useEffect(() => {
    if (authed.data === false) router.replace("/login");
  }, [authed.data, router]);
  const sessions = useQuery({
    queryKey: ["sessions", page, filter, search],
    queryFn: ({ signal }) => api<Paginated<Session>>(`/sessions/?page=${page}${filter === "all" ? "" : `&status=${filter}`}${search ? `&search=${encodeURIComponent(search)}` : ""}`, { signal }),
    enabled: authed.data === true,
  });
  const newChat = useMutation({
    mutationFn: () => api<Session>("/sessions/", { method: "POST", body: "{}" }),
    onSuccess: async (session) => {
      await queryClient.cancelQueries({ queryKey: ["sessions"] });
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      router.push(`/chat/${session.id}`);
    },
  });
  if (authed.isError) return <div className="mx-auto max-w-lg p-8"><ErrorState message={authed.error.message} onRetry={() => authed.refetch()} /></div>;
  if (authed.data !== true) {
    return <div className="flex min-h-dvh items-center justify-center gap-3 bg-[#070910] p-6 text-center text-sm text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-orange-400" /> Establishing secure link…{process.env.NEXT_PUBLIC_DIRECT_API_URL && <p className="max-w-sm text-xs">First visit? The free backend may take about a minute to wake up.</p>}</div>;
  }
  const visible = sessions.data?.results;

  return (
    <AppShell>
      <main className="relative flex-1 overflow-y-auto bg-[#080a12] px-5 py-7 md:px-9 md:py-9">
        <div className="pointer-events-none absolute inset-0 neon-grid opacity-50" />
        <div className="pointer-events-none absolute left-[45%] top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-violet-500/[0.08] blur-3xl" />
        <div className="relative mx-auto max-w-[1400px]">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300"><span className="h-1.5 w-1.5 rounded-full bg-violet-300 shadow-[0_0_8px_#a78bfa]" /> Vehicle intelligence / node 01</div>
              <h1 className="max-w-2xl text-4xl font-semibold leading-[.98] tracking-[-0.065em] text-white md:text-6xl">Understand the<br /><span className="bg-gradient-to-r from-white via-slate-200 to-violet-300 bg-clip-text text-transparent">machine.</span></h1>
              <p className="mt-4 max-w-lg text-sm leading-6 text-slate-500">Your car is always sending signals. Pitstop turns the weird noise, warning light, or gut feeling into a clear next move.</p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-right">
              <div><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600">Core status</p><p className="mt-1 text-xs font-semibold text-[#b7f36b]">Nominal / ready</p></div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#b7f36b]/20 bg-[#b7f36b]/[0.06] text-[#b7f36b]"><Activity size={18} /></div>
            </div>
          </div>

          <section className="relative isolate overflow-hidden rounded-[28px] border border-white/[0.12] bg-[#0b0f19] shadow-2xl shadow-black/30">
            <div className="absolute inset-0 neon-grid opacity-60" />
            <div className="absolute -right-16 -top-24 h-80 w-80 rounded-full bg-orange-500/[0.12] blur-3xl" />
            <div className="absolute bottom-0 left-1/3 h-48 w-80 rounded-full bg-violet-600/[0.12] blur-3xl" />
            <div className="relative grid min-h-[350px] lg:grid-cols-[1.05fr_.95fr]">
              <div className="flex flex-col justify-between p-7 md:p-10">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-orange-300/20 bg-orange-400/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-200"><Sparkles size={12} /> AI mechanic online</span>
                  <h2 className="mt-6 max-w-md text-3xl font-medium leading-[1.05] tracking-[-0.05em] text-white md:text-5xl">Make the next<br /><span className="text-orange-300">move obvious.</span></h2>
                  <p className="mt-4 max-w-[370px] text-xs leading-6 text-slate-400">Start a live diagnostic thread. Talk normally — our reasoning engine will translate the symptoms into a plan you can trust.</p>
                  <button onClick={() => newChat.mutate()} disabled={newChat.isPending} className="btn-primary mt-7">{newChat.isPending ? "Spinning up core…" : "Start diagnostic thread"}<ArrowUpRight size={17} /></button>
                </div>
                <div className="mt-8 flex flex-wrap items-center gap-5 text-[10px] text-slate-500"><span className="flex items-center gap-2"><Terminal size={13} className="text-violet-300" /> Text + image + audio</span><span className="flex items-center gap-2"><Zap size={13} className="text-orange-300" /> Guided reasoning</span><span className="flex items-center gap-2"><ShieldDot /> Private by default</span></div>
              </div>
              <div className="relative hidden min-h-[350px] overflow-hidden lg:block">
                <Image src="/garage.jpg" alt="Silver coupe in a dark garage" fill sizes="45vw" className="object-cover opacity-40 mix-blend-screen" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0b0f19] via-[#0b0f19]/30 to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative flex h-64 w-64 items-center justify-center">
                    <div className="pulse-ring absolute h-44 w-44 rounded-full border border-orange-300/40" />
                    <div className="absolute h-52 w-52 rounded-full border border-dashed border-violet-300/20" />
                    <div className="absolute h-36 w-36 rounded-full border border-cyan-300/20" />
                    <div className="absolute h-24 w-24 rounded-full bg-orange-400/20 blur-xl" />
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-[26px] border border-orange-200/40 bg-[#ff6b3d]/20 text-orange-200 shadow-[0_0_55px_-12px_#ff6b3d] float-slow"><Cpu size={33} strokeWidth={1.5} /></div>
                    <span className="absolute left-0 top-8 text-[8px] font-bold uppercase tracking-[0.2em] text-cyan-200/70">signal / 98%</span>
                    <span className="absolute bottom-7 right-0 text-[8px] font-bold uppercase tracking-[0.2em] text-violet-200/70">neural / ready</span>
                    <span className="absolute right-1 top-0 h-1.5 w-1.5 rounded-full bg-[#b7f36b] shadow-[0_0_10px_#b7f36b]" />
                  </div>
                </div>
                <div className="absolute bottom-6 right-7 rounded-xl border border-white/10 bg-black/30 px-3 py-2 backdrop-blur-md"><p className="text-[8px] uppercase tracking-[0.2em] text-slate-500">Live inference</p><p className="mt-1 font-mono text-[11px] text-orange-200">0.0042 ms <span className="text-[#b7f36b]">●</span></p></div>
              </div>
            </div>
            {newChat.isError && <div className="relative px-7 pb-6 md:px-10"><ErrorState message={newChat.error.message} onRetry={() => newChat.mutate()} /></div>}
          </section>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="panel group flex items-center gap-4 p-4 transition hover:border-violet-300/20"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-300/15 bg-violet-400/[0.08] text-violet-300"><Bot size={19} /></span><div><p className="text-xs font-semibold text-slate-200">Talk like a human</p><p className="mt-1 text-[11px] text-slate-600">No mechanic vocabulary required</p></div><ArrowUpRight size={14} className="ml-auto text-slate-700 transition group-hover:text-violet-300" /></div>
            <div className="panel group flex items-center gap-4 p-4 transition hover:border-cyan-300/20"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-400/[0.08] text-cyan-300"><Camera size={19} /></span><div><p className="text-xs font-semibold text-slate-200">Feed the signal</p><p className="mt-1 text-[11px] text-slate-600">Photo, audio, or video evidence</p></div><ArrowUpRight size={14} className="ml-auto text-slate-700 transition group-hover:text-cyan-300" /></div>
            <div className="panel group flex items-center gap-4 p-4 transition hover:border-[#b7f36b]/20"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#b7f36b]/15 bg-[#b7f36b]/[0.08] text-[#b7f36b]"><Wrench size={19} /></span><div><p className="text-xs font-semibold text-slate-200">Leave with a plan</p><p className="mt-1 text-[11px] text-slate-600">Know what to do before you repair</p></div><ArrowUpRight size={14} className="ml-auto text-slate-700 transition group-hover:text-[#b7f36b]" /></div>
          </div>

          <div className="mt-10 grid gap-6 xl:grid-cols-[1fr_320px]">
            <section id="conversations" className="min-w-0 scroll-mt-5">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><div className="mb-1 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-orange-400 shadow-[0_0_8px_#ff6b3d]" /><span className="eyebrow text-orange-300/70">Your diagnostic memory</span></div><h2 aria-label="Conversations" className="text-2xl font-semibold tracking-[-0.04em] text-white">Conversations <span className="ml-1 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 align-middle text-[10px] font-medium text-slate-500">{sessions.data?.count ?? "—"}</span></h2></div><button onClick={() => newChat.mutate()} disabled={newChat.isPending} aria-label="Create another conversation" className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-slate-400 hover:border-orange-300/30 hover:text-orange-300"><Plus size={15} /> New thread</button></div>
              <div className="glass-panel overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] p-4"><div className="flex gap-1 rounded-lg bg-black/20 p-1">{[["all", "All"], ["in_progress", "In progress"], ["diagnosed", "Diagnosed"], ["booked", "Booked"]].map(([value, label]) => <button key={value} onClick={() => (setFilter(value), setPage(1))} className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition ${filter === value ? "bg-white/[0.11] text-slate-100 shadow-sm" : "text-slate-600 hover:text-slate-300"}`}>{label}</button>)}</div><label className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/10 px-2.5 py-1.5 text-slate-500"><Search size={14} /><input aria-label="Search conversations" value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search threads…" className="w-28 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600" /></label></div>
                {sessions.isLoading && <div className="space-y-3 p-5" aria-label="Loading conversations">{[1, 2, 3].map((n) => <div key={n} className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />)}</div>}
                {sessions.isError && <div className="p-4"><ErrorState message={sessions.error.message} onRetry={() => sessions.refetch()} /></div>}
                {visible?.map((s) => <Link key={s.id} href={`/chat/${s.id}`} className="group flex items-center gap-3 border-b border-white/[0.07] p-5 last:border-b-0 hover:bg-white/[0.035]"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-500 group-hover:border-orange-300/30 group-hover:text-orange-300"><MessageSquare size={17} /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-200">Conversation #{s.id}</p><p className="mt-1 font-mono text-[10px] text-slate-600">SYNCED {new Date(s.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}</p></div><StatusBadge status={s.status} /><ChevronRight size={15} className="text-slate-700 transition group-hover:text-orange-300" /></Link>)}
                {visible?.length === 0 && <div className="px-6 py-12 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-600"><MessageSquare size={22} /></span><p className="mt-4 text-sm font-medium text-slate-300">{!search && filter === "all" && sessions.data?.count === 0 ? "No conversations yet." : "No matching conversations."}</p><p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-slate-600">Start a thread and we’ll keep your car’s story here, ready whenever you need it.</p></div>}
                {sessions.data && (sessions.data.next || sessions.data.previous) && <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-3 text-xs text-slate-500"><button aria-label="Previous page" disabled={!sessions.data.previous} onClick={() => setPage((p) => p - 1)} className="rounded p-2 disabled:opacity-30"><ChevronLeft size={16} /></button>Page {page}<button aria-label="Next page" disabled={!sessions.data.next} onClick={() => setPage((p) => p + 1)} className="rounded p-2 disabled:opacity-30"><ChevronRight size={16} /></button></div>}
              </div>
            </section>
            <aside id="how-it-works" className="scroll-mt-5"><div className="mb-4 flex items-center justify-between"><div><p className="eyebrow text-violet-300/70">How the core thinks</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-white">AI protocol</h2></div><Radar size={19} className="text-violet-300" /></div><div className="panel p-5">{[["01", "Listen", "Describe the symptom in your own words."], ["02", "Cross-check", "The engine maps patterns against your context."], ["03", "Surface", "You get the safest next move, not a guess."]].map(([num, title, text], i) => <div key={num} className={`flex gap-3 ${i < 2 ? "mb-7" : ""}`}><span className="font-mono text-[10px] font-semibold text-orange-300">{num}</span><div><p className="text-xs font-semibold text-slate-200">{title}</p><p className="mt-1.5 text-[11px] leading-5 text-slate-600">{text}</p></div></div>)}</div><div className="mt-4 flex gap-2 rounded-xl border border-[#b7f36b]/10 bg-[#b7f36b]/[0.04] p-4 text-[10px] leading-5 text-slate-500"><CircleHelp size={14} className="mt-0.5 shrink-0 text-[#b7f36b]" />AI is a copilot, not a substitute for an in-person inspection.</div><div className="mt-4 flex items-center justify-between px-1 font-mono text-[9px] uppercase tracking-wider text-slate-700"><span>latency <b className="text-[#b7f36b]">low</b></span><SignalBar value={.9} tone="lime" /></div></aside>
          </div>
          <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] py-5 font-mono text-[9px] uppercase tracking-[0.15em] text-slate-700"><span>pitstop / your drive, decoded</span><span className="flex items-center gap-2"><AudioLines size={12} /> all systems nominal</span></footer>
        </div>
      </main>
    </AppShell>
  );
}

function ShieldDot() {
  return <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#b7f36b]/50 text-[8px] text-[#b7f36b]">✓</span>;
}
