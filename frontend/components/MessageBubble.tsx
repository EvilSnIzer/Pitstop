import { Wrench } from "lucide-react";
import type { Message } from "@/lib/types";

function Media({ url, type }: { url: string; type: string }) {
  if (type.startsWith("image/")) {
    // Uploaded media is user-provided and served by the configured storage backend.
    return (
      <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Vehicle issue attachment"
          className="mb-3 max-h-64 max-w-full rounded-xl object-contain"
        />
      </a>
    );
  }
  if (type.startsWith("video/"))
    return (
      <video src={url} controls className="mb-3 max-h-64 w-full rounded-xl" />
    );
  return <audio src={url} controls className="mb-3 max-w-full" />;
}

export default function MessageBubble({ message }: { message: Message }) {
  const user = message.role === "user";
  return (
    <div
      className={`flex items-start gap-3 ${user ? "justify-end" : "justify-start"}`}
    >
      {!user && (
        <span className="mt-6 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#fcebe3] text-[#d96138]">
          <Wrench size={15} />
        </span>
      )}
      <div
        className={`min-w-0 max-w-[85%] md:max-w-[80%] ${user ? "text-right" : ""}`}
      >
        <p className="mb-2 flex items-center gap-2 text-[10px] text-slate-500">
          <span
            className={`font-medium text-slate-500 ${user ? "ml-auto" : ""}`}
          >
            {user ? "You" : "Pitstop assistant"}
          </span>
          <span>·</span>
          <time dateTime={message.created_at}>
            {new Date(message.created_at).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </p>
        <div
          className={`rounded-2xl px-4 py-3.5 text-left text-[13px] leading-7 ${user ? "rounded-tr-md bg-[#283338] text-white" : "rounded-tl-md border border-slate-200/80 bg-white text-slate-600 shadow-sm"}`}
        >
          {message.media_url && message.media_type && (
            <Media url={message.media_url} type={message.media_type} />
          )}
          {message.content && (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}
        </div>
      </div>
    </div>
  );
}
