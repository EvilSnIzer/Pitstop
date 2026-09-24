"use client";

import { useRef, useState } from "react";
import {
  ArrowUp,
  AudioLines,
  ImagePlus,
  LoaderCircle,
  Paperclip,
  X,
} from "lucide-react";
import { uploadMedia } from "@/lib/api";
import { handleAuthError } from "@/lib/auth";

type SendInput = { content: string; media_id?: number; request_id: string };

export default function Composer({
  onSend,
  disabled,
}: {
  onSend: (input: SendInput) => Promise<void>;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<{ content: string; file: File | null; key: string }>({
    content: "",
    file: null,
    key: "",
  });
  const canSubmit =
    !disabled && !uploading && (text.trim().length > 0 || file !== null);
  function removeFile() {
    setFile(null);
    if (input.current) input.current.value = "";
  }
  async function submit() {
    if (!canSubmit) return;
    const content = text.trim();
    setUploadError(null);
    if (request.current.content !== content || request.current.file !== file)
      request.current = { content, file, key: crypto.randomUUID() };
    let media_id: number | undefined;
    if (file) {
      setUploading(true);
      try {
        const media = await uploadMedia(file);
        media_id = media.id;
      } catch (err) {
        handleAuthError(err);
        setUploadError(err instanceof Error ? err.message : "Upload failed");
        return;
      } finally {
        setUploading(false);
      }
    }
    try {
      await onSend({ content, media_id, request_id: request.current.key });
    } catch {
      return;
    } // The parent displays the send error; preserve the editable draft.
    request.current = { content: "", file: null, key: "" };
    setText("");
    removeFile();
  }
  return (
    <div className="shrink-0 bg-[#f7f8fa] px-4 pb-4 pt-3 md:px-7">
      {uploadError && (
        <p role="alert" className="mb-2 text-xs text-red-600">
          {uploadError}
        </p>
      )}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.12)] focus-within:border-orange-300 focus-within:ring-2 focus-within:ring-orange-100">
        {file && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <Paperclip size={13} />
            <span className="min-w-0 flex-1 truncate">
              {file.name} · {Math.round(file.size / 1024)} KB
            </span>
            <button
              aria-label="Remove attachment"
              disabled={disabled || uploading}
              onClick={removeFile}
              className="p-1"
            >
              <X size={13} />
            </button>
          </div>
        )}
        <textarea
          aria-label="Message your mechanic"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          maxLength={4000}
          disabled={disabled || uploading}
          placeholder="Tell us what’s happening with your car…"
          className="max-h-32 min-h-[52px] w-full resize-y bg-transparent px-2 py-1 text-base leading-6 sm:text-[13px] text-slate-700 outline-none placeholder:text-slate-500 disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={disabled || uploading}
              aria-label="Attach a photo, audio or video"
              className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            >
              <Paperclip size={16} />
              <span className="hidden sm:block">Attach</span>
            </button>
            <span className="h-4 w-px bg-slate-200" />
            <span
              className="flex items-center gap-2 text-slate-300"
              aria-hidden="true"
            >
              <ImagePlus size={15} />
              <AudioLines size={15} />
            </span>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/wav,audio/webm,audio/ogg,video/mp4,video/webm"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <button
            onClick={submit}
            disabled={!canSubmit}
            aria-label={uploading ? "Uploading attachment" : "Send"}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ed623a] text-white hover:bg-orange-700 disabled:bg-slate-100 disabled:text-slate-500"
          >
            {uploading ? (
              <LoaderCircle size={17} className="animate-spin" />
            ) : (
              <ArrowUp size={19} />
            )}
          </button>
        </div>
      </div>
      <p className="mt-2.5 text-center text-[9px] text-slate-500">
        AI guidance can be inaccurate. Have safety-critical issues checked by a
        qualified mechanic.
      </p>
    </div>
  );
}
