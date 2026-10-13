"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, CornerDownLeft, FileText, PenLine, Sparkles, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { AiTask } from "@/lib/domain";

type Status = "idle" | "streaming" | "done" | "error";

interface Props {
  ticketId: string;
  providerLabel: string;
  used: number;
  limit: number;
}

export function AiAssistPanel({ ticketId, providerLabel, used, limit }: Props) {
  const [task, setTask] = useState<AiTask | null>(null);
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [usedCount, setUsedCount] = useState(used);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function run(next: AiTask) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTask(next);
    setOutput("");
    setError(null);
    setCopied(false);
    setStatus("streaming");

    try {
      const response = await fetch(`/api/tickets/${ticketId}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: next }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "AI assist failed. Please try again.");
      }
      setUsedCount((count) => count + 1);
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        setOutput((previous) => previous + value);
      }
      setStatus("done");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setStatus("done");
        return;
      }
      setError(caught instanceof Error ? caught.message : "AI assist failed");
      setStatus("error");
    }
  }

  function insertAsReply() {
    const textarea = document.getElementById("reply-body");
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.value = output.trim();
      textarea.focus();
      textarea.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(output.trim());
    setCopied(true);
  }

  const streaming = status === "streaming";

  return (
    <section className="rounded-xl border border-brand-100 bg-gradient-to-b from-brand-50/70 to-white shadow-xs" aria-label="AI assist">
      <header className="flex items-center justify-between gap-3 border-b border-brand-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-brand-600 text-white">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">AI assist</h2>
            <p className="text-[11px] text-slate-500">Summaries and reply drafts, streamed live</p>
          </div>
        </div>
        <Badge tone="brand">{providerLabel}</Badge>
      </header>

      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-2">
          <Button variant={task === "summary" ? "primary" : "secondary"} size="sm" onClick={() => run("summary")} disabled={streaming}>
            <FileText className="size-3.5" aria-hidden /> Summarise thread
          </Button>
          <Button variant={task === "reply" ? "primary" : "secondary"} size="sm" onClick={() => run("reply")} disabled={streaming}>
            <PenLine className="size-3.5" aria-hidden /> Draft reply
          </Button>
        </div>

        <div
          className={cn(
            "min-h-36 rounded-lg border bg-white p-4 text-sm leading-6 whitespace-pre-wrap text-slate-700",
            status === "error" ? "border-rose-200" : "border-slate-200",
          )}
          aria-live="polite"
          aria-busy={streaming}
        >
          {status === "idle" ? (
            <p className="text-slate-400">
              Generate a summary of the conversation or a draft reply. Internal notes inform drafts but are never quoted.
            </p>
          ) : status === "error" ? (
            <p className="text-rose-600">{error}</p>
          ) : (
            <span className={cn(streaming && "ai-caret")}>{output}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500 tabular-nums">
            {usedCount} of {limit.toLocaleString("en-US")} assists used this month
          </p>
          <div className="flex gap-2">
            {streaming ? (
              <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
                <Square className="size-3" aria-hidden /> Stop
              </Button>
            ) : null}
            {status === "done" && output ? (
              <Button variant="ghost" size="sm" onClick={copy}>
                {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </Button>
            ) : null}
            {status === "done" && task === "reply" && output ? (
              <Button variant="secondary" size="sm" onClick={insertAsReply}>
                <CornerDownLeft className="size-3.5" aria-hidden /> Use as reply
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
