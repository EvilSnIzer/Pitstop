"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronRight,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  ShieldCheck,
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
    queryFn: ({ signal }) =>
      api<Paginated<Session>>("/sessions/?page=1", { signal }),
    enabled: auth.data === true,
  });

  return (
    <div className="flex h-dvh overflow-hidden">
      {open && (
        <button
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm lg:hidden"
        />
      )}
      <aside
        ref={navPanel}
        id="workspace-navigation"
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label="Workspace navigation"
        className={`${open ? "visible translate-x-0" : "invisible -translate-x-full"} fixed inset-y-0 left-0 z-40 flex w-[232px] shrink-0 flex-col border-r border-slate-200/80 bg-white transition-transform lg:visible lg:static lg:translate-x-0`}
      >
        <div className="flex h-24 items-center justify-between px-7">
          <Link href="/" aria-label="Pitstop home">
            <Brand />
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="p-2 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-4">
          <p className="eyebrow mb-3 px-3">Your workspace</p>
          <Link
            onClick={() => setOpen(false)}
            href="/"
            className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${path === "/" ? "bg-orange-50 text-[#d6502b]" : "text-slate-500 hover:bg-slate-50"}`}
          >
            <LayoutGrid size={18} /> Overview{" "}
            <ChevronRight size={14} className="ml-auto" />
          </Link>
          <Link
            onClick={() => setOpen(false)}
            href="/#conversations"
            className="mt-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-500 hover:bg-slate-50"
          >
            <MessageSquare size={18} /> Conversations
          </Link>
        </div>
        <div className="mt-9 min-h-0 flex-1 overflow-y-auto px-4">
          <div className="mb-3 flex items-center justify-between px-3">
            <p className="eyebrow">Recent activity</p>
            <Link
              href="/"
              aria-label="Start from overview"
              className="text-slate-500 hover:text-orange-600"
            >
              <Plus size={14} />
            </Link>
          </div>
          {sessions.data?.results.slice(0, 5).map((s) => (
            <Link
              onClick={() => setOpen(false)}
              key={s.id}
              href={`/chat/${s.id}`}
              className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-xs ${path === `/chat/${s.id}` ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-500 hover:bg-slate-50"}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${s.status === "in_progress" ? "bg-orange-400" : "bg-emerald-500"}`}
              />
              Conversation #{s.id}
            </Link>
          ))}
          {sessions.data?.count === 0 && (
            <p className="px-3 text-xs leading-6 text-slate-500">
              Your conversations will appear here.
            </p>
          )}
        </div>
        <div className="m-4 rounded-xl border border-slate-100 bg-[#f8f9fb] p-4">
          <ShieldCheck size={20} className="mb-3 text-slate-500" />
          <p className="text-xs font-semibold">
            A little clarity. A safer drive.
          </p>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">
            AI guidance is a starting point, not a substitute for an inspection.
          </p>
          <Link
            href="/#how-it-works"
            className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-slate-700"
          >
            How it works <ArrowUpRight size={13} />
          </Link>
        </div>
        {signOutError && (
          <p role="alert" className="px-4 text-xs text-red-700">
            {signOutError}
          </p>
        )}
        <button
          onClick={async () => {
            try {
              await logout();
              queryClient.clear();
              router.replace("/login");
            } catch {
              setSignOutError(
                "Sign-out could not be confirmed. Please try again.",
              );
            }
          }}
          className="flex items-center gap-3 border-t border-slate-100 px-7 py-5 text-xs font-medium text-slate-500 hover:bg-slate-50"
        >
          <LogOut size={16} /> Sign out
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[70px] shrink-0 items-center justify-between border-b border-slate-200/70 bg-white/80 px-5 md:px-9">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="workspace-navigation"
              className="-ml-2 p-2 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <span className="text-xs text-slate-500">Workspace</span>
            <ChevronRight size={12} className="text-slate-300" />
            <span className="text-xs font-medium">
              {path.startsWith("/chat") ? "Diagnostic workspace" : "Overview"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-medium text-slate-500 sm:block">
              AI-assisted car care
            </span>
            <span
              aria-label="Driver account"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f4e9df] text-[10px] font-bold text-[#95724f]"
            >
              YOU
            </span>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
