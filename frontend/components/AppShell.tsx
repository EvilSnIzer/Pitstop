"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronRight,
  Gauge,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Radar,
  Sparkles,
  X,
} from "lucide-react";
import { useDialogFocus } from "@/lib/useDialogFocus";
import Brand from "./Brand";
import { api } from "@/lib/api";
import { isAuthed, logout } from "@/lib/auth";
import type { Paginated, Session } from "@/lib/types";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const navPanel = useRef<HTMLElement>(null);
  useDialogFocus(open, navPanel, () => setOpen(false));
  const auth = useQuery({ queryKey: ["auth"], queryFn: isAuthed });
  const [signOutError, setSignOutError] = useState("");
  const sessions = useQuery({
    queryKey: ["sessions", 1, "all", ""],
    queryFn: ({ signal }) => api<Paginated<Session>>("/sessions/?page=1", { signal }),
    enabled: auth.data === true,
  });

  return (
    <div className="flex h-dvh overflow-hidden bg-[#070910] text-slate-100">
      {open && (
        <button
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}
      <aside
        ref={navPanel}
        id="workspace-navigation"
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label="Workspace navigation"
        className={`${open ? "visible translate-x-0" : "invisible -translate-x-full"} fixed inset-y-0 left-0 z-40 flex w-[254px] shrink-0 flex-col border-r border-white/[0.09] bg-[#0a0d15] transition-transform lg:visible lg:static lg:translate-x-0`}
      >
        <div className="flex h-[86px] items-center justify-between border-b border-white/[0.07] px-6">
          <Link href="/" aria-label="Pitstop home">
            <Brand />
          </Link>
          <button onClick={() => setOpen(false)} aria-label="Close menu" className="p-2 text-slate-500 lg:hidden">
            <X size={18} />
          </button>
        </div>
        <div className="px-4 pt-7">
          <p className="eyebrow mb-3 px-3">Command deck</p>
          <Link
            onClick={() => setOpen(false)}
            href="/"
            className={`group flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-semibold transition ${path === "/" ? "border-orange-400/20 bg-orange-400/[0.09] text-orange-300" : "border-transparent text-slate-500 hover:bg-white/[0.04] hover:text-slate-200"}`}
          >
            <LayoutGrid size={17} /> Overview
            <ChevronRight size={14} className="ml-auto opacity-50" />
          </Link>
          <Link
            onClick={() => setOpen(false)}
            href="/#conversations"
            className="mt-1 flex items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-sm text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-200"
          >
            <MessageSquare size={17} /> Conversations
          </Link>
          <div className="mt-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-600">
            <Radar size={17} /> Signal monitor
            <span className="ml-auto rounded bg-white/[0.06] px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-slate-500">soon</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-600">
            <Gauge size={17} /> Garage profile
            <span className="ml-auto rounded bg-white/[0.06] px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-slate-500">soon</span>
          </div>
        </div>
        <div className="mt-8 min-h-0 flex-1 overflow-y-auto px-4">
          <div className="mb-3 flex items-center justify-between px-3">
            <p className="eyebrow">Recent threads</p>
            <Link href="/" aria-label="Start from overview" className="text-slate-500 hover:text-orange-400">
              <Plus size={14} />
            </Link>
          </div>
          {sessions.data?.results.slice(0, 5).map((s) => (
            <Link
              onClick={() => setOpen(false)}
              key={s.id}
              href={`/chat/${s.id}`}
              className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-xs transition ${path === `/chat/${s.id}` ? "bg-white/[0.07] font-semibold text-slate-100" : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200"}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full shadow-[0_0_8px_currentColor] ${s.status === "in_progress" ? "bg-orange-400 text-orange-400" : "bg-[#b7f36b] text-[#b7f36b]"}`} />
              Thread #{s.id}
              <span className="ml-auto text-[9px] text-slate-600">{s.status === "in_progress" ? "LIVE" : "DONE"}</span>
            </Link>
          ))}
          {sessions.data?.count === 0 && (
            <p className="px-3 text-xs leading-6 text-slate-600">Your diagnostic threads will appear here.</p>
          )}
        </div>
        <div className="mx-4 mb-4 overflow-hidden rounded-2xl border border-violet-400/15 bg-gradient-to-br from-violet-400/[0.11] to-cyan-400/[0.04] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/15 text-violet-300"><Sparkles size={14} /></span>
            <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[#b7f36b]"><i className="h-1.5 w-1.5 rounded-full bg-[#b7f36b] shadow-[0_0_8px_#b7f36b]" /> Online</span>
          </div>
          <p className="text-xs font-semibold">AI core is listening.</p>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">Describe the weird sound. Upload the evidence. Get a signal.</p>
          <Link href="/#how-it-works" className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-violet-300">System protocol <ArrowUpRight size={13} /></Link>
        </div>
        {signOutError && <p role="alert" className="px-4 pb-2 text-xs text-red-400">{signOutError}</p>}
        <button
          onClick={async () => {
            try {
              await logout();
              queryClient.clear();
              router.replace("/login");
            } catch {
              setSignOutError("Sign-out could not be confirmed. Please try again.");
            }
          }}
          className="flex items-center gap-3 border-t border-white/[0.07] px-7 py-5 text-xs font-medium text-slate-500 hover:bg-white/[0.04] hover:text-slate-200"
        >
          <LogOut size={16} /> Sign out
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[70px] shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#080b12]/80 px-5 backdrop-blur-xl md:px-9">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="workspace-navigation" className="-ml-2 p-2 text-slate-400 lg:hidden"><Menu size={20} /></button>
            <span className="text-xs text-slate-600">NEXUS</span>
            <ChevronRight size={12} className="text-slate-700" />
            <span className="text-xs font-medium text-slate-300">{path.startsWith("/chat") ? "Diagnostic workspace" : "Overview"}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-[#b7f36b]/15 bg-[#b7f36b]/[0.06] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#b7f36b] sm:flex"><i className="h-1.5 w-1.5 rounded-full bg-[#b7f36b] shadow-[0_0_7px_#b7f36b]" /> System online</span>
            <span aria-label="Driver account" className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-400/20 bg-violet-400/10 text-[10px] font-bold text-violet-200">YOU</span>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
