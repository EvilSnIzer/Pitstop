"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { login, register, saveAuth } from "@/lib/auth";
import Brand from "./Brand";
import ErrorState from "./ErrorState";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const signingUp = mode === "register";
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const submit = useMutation({
    mutationFn: () =>
      signingUp
        ? register(email.trim(), password)
        : login(email.trim(), password),
    onSuccess: () => {
      saveAuth();
      queryClient.clear();
      queryClient.setQueryData(["auth"], true);
      router.replace("/");
    },
  });
  return (
    <main className="grid min-h-dvh bg-white lg:grid-cols-[1fr_1.05fr]">
      <section className="flex min-h-dvh flex-col px-7 py-8 md:px-14 lg:px-16">
        <Link href="/" className="self-start" aria-label="Pitstop home">
          <Brand />
        </Link>
        <div className="mx-auto flex w-full max-w-[370px] flex-1 flex-col justify-center py-14">
          <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-2xl border border-orange-100 bg-orange-50 text-orange-600">
            <Sparkles size={21} />
          </div>
          <p className="eyebrow mb-3 text-orange-600">
            YOUR CAR. BETTER UNDERSTOOD.
          </p>
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.045em]">
            {signingUp ? "Create an account" : "Sign in"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {signingUp
              ? "A little more clarity for the road ahead. Your car-care workspace starts here."
              : "Welcome back. Let’s pick up where you and your car left off."}
          </p>
          <form
            className="mt-8 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!submit.isPending) submit.mutate();
            }}
          >
            <label className="block text-xs font-semibold text-slate-700">
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="field"
              />
            </label>
            <div>
              <label
                htmlFor="password"
                className="text-xs font-semibold text-slate-700"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={signingUp ? "new-password" : "current-password"}
                  required
                  minLength={signingUp ? 8 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    signingUp
                      ? "Create a strong password"
                      : "Enter your password"
                  }
                  className="field pr-12"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-5 p-1 text-slate-500 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {signingUp && (
                <p className="mt-2 text-[11px] text-slate-500">
                  At least 8 characters.
                </p>
              )}
            </div>
            {submit.isError && (
              <ErrorState
                message={submit.error.message}
                onRetry={() => submit.mutate()}
              />
            )}
            <button
              type="submit"
              disabled={submit.isPending}
              className="btn-primary w-full py-3.5"
            >
              {submit.isPending
                ? signingUp
                  ? "Creating account…"
                  : "Signing in…"
                : signingUp
                  ? "Create account"
                  : "Sign in"}
              <ArrowRight size={16} />
            </button>
          </form>
          <p className="mt-7 text-center text-xs text-slate-500">
            {signingUp ? "Already have an account?" : "New to Pitstop?"}{" "}
            <Link
              href={signingUp ? "/login" : "/register"}
              className="font-semibold text-orange-600 hover:text-orange-700"
            >
              {signingUp ? "Sign in" : "Create an account"}
            </Link>
          </p>
          <div className="mt-9 flex items-center justify-center gap-2 border-t border-slate-100 pt-6 text-[10px] text-slate-500">
            <ShieldCheck size={14} /> Your conversations, saved to your account.
          </div>
        </div>
        <p className="text-[10px] text-slate-500">
          Built for the everyday driver. Not just the car enthusiast.
        </p>
      </section>
      <section className="relative isolate m-3 ml-0 hidden overflow-hidden rounded-[24px] bg-[#202528] text-white lg:flex lg:flex-col lg:justify-between">
        <Image
          src="/garage.jpg"
          alt="Silver classic coupe in a warm, architectural garage"
          fill
          priority
          sizes="55vw"
          className="-z-20 object-cover object-[64%_center]"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#181d22] via-[#181d22]/30 to-[#181d22]/95" />
        <div className="p-12">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-[10px] tracking-wide text-slate-200">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" /> A
            SMARTER START TO CAR CARE
          </span>
          <h2 className="mt-8 text-5xl font-medium leading-[1.12] tracking-[-0.05em]">
            Every car has
            <br />a story.
            <br />
            <span className="text-[#efad91]">
              Let’s understand
              <br />
              yours.
            </span>
          </h2>
          <p className="mt-5 max-w-xs text-sm leading-7 text-slate-300">
            From “what’s that noise?” to knowing what to do next. Meet your
            virtual mechanic.
          </p>
        </div>
        <div className="p-12">
          <div className="mb-8 flex flex-wrap gap-x-5 gap-y-3 text-[11px] text-slate-200">
            {[
              "Text, photo & audio",
              "Guided diagnosis",
              "Repair recommendations",
            ].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <Check size={13} className="text-orange-300" />
                {t}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-white/15 pt-5">
            <span className="text-[10px] tracking-wider text-slate-500">
              LESS GUESSWORK. MORE CONFIDENCE.
            </span>
            <span className="text-lg font-bold tracking-tight">pitstop.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
