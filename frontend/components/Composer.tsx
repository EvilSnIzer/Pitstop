"use client";

import { useRef, useState } from "react";
import { ArrowUp, AudioLines, ImagePlus, LoaderCircle, Paperclip, X } from "lucide-react";
import { uploadMedia } from "@/lib/api";
import { handleAuthError } from "@/lib/auth";

type SendInput = { content: string; media_id?: number; request_id: string };

export default function Composer({ onSend, disabled }: { onSend: (input: SendInput) => Promise<void>; disabled: boolean }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<{ content: string; file: File | null; key: string }>({ content: "", file: null, key: "" });
  const canSubmit = !disabled && !uploading && (text.trim().length > 0 || file !== null);
  function removeFile() { setFile(null); if (input.current) input.current.value = ""; }
  async function submit() {
    if (!canSubmit) return;
    const content = text.trim();
    setUploadError(null);
    if (request.current.content !== content || request.current.file !== file) request.current = { content, file, key: crypto.randomUUID() };
    let media_id: number | undefined;
    if (file) { setUploading(true); try { const media = await uploadMedia(file); media_id = media.id; } catch (err) { handleAuthError(err); setUploadError(err instanceof Error ? err.message : "Upload failed"); return; } finally { setUploading(false); } }
    try { await onSend({ content, media_id, request_id: request.current.key }); } catch { return; }
    request.current = { content: "", file: null, key: "" }; setText(""); removeFile();
  }
  return <div className="shrink-0 bg-[#080a12] px-4 pb-4 pt-3 md:px-8">
    {uploadError && <p role="alert" className="mb-2 text-xs text-red-300">{uploadError}</p>}
    <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.12] bg-[#101522] p-3 shadow-2xl shadow-black/20 focus-within:border-orange-300/40 focus-within:ring-2 focus-within:ring-orange-500/10">
      {file && <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-slate-400"><Paperclip size={13} /><span className="min-w-0 flex-1 truncate">{file.name} · {Math.round(file.size / 1024)} KB</span><button aria-label="Remove attachment" disabled={disabled || uploading} onClick={removeFile} className="p-1 hover:text-white"><X size={13} /></button></div>}
      <textarea aria-label="Message your mechanic" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} rows={2} maxLength={4000} disabled={disabled || uploading} placeholder="Describe the symptom. The core is listening…" className="max-h-32 min-h-[52px] w-full resize-y bg-transparent px-2 py-1 text-base leading-6 text-slate-200 outline-none placeholder:text-slate-600 disabled:opacity-60 sm:text-[13px]" />
      <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-3"><button type="button" onClick={() => input.current?.click()} disabled={disabled || uploading} aria-label="Attach a photo, audio or video" className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-slate-500 hover:bg-white/[0.05] hover:text-slate-200 disabled:opacity-40"><Paperclip size={16} /><span className="hidden sm:block">Attach evidence</span></button><span className="h-4 w-px bg-white/10" /><span className="flex items-center gap-2 text-slate-600" aria-hidden="true"><ImagePlus size={15} /><AudioLines size={15} /></span><input ref={input} type="file" accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/wav,audio/webm,audio/ogg,video/mp4,video/webm" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div><button onClick={submit} disabled={!canSubmit} aria-label={uploading ? "Uploading attachment" : "Send"} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ff6b3d] text-white shadow-[0_0_18px_-6px_#ff6b3d] hover:bg-orange-400 disabled:bg-white/[0.06] disabled:text-slate-600">{uploading ? <LoaderCircle size={17} className="animate-spin" /> : <ArrowUp size={19} />}</button></div>
    </div>
    <p className="mt-2.5 text-center text-[9px] text-slate-600">AI guidance can be inaccurate. Have safety-critical issues checked by a qualified mechanic.</p>
  </div>;
}
