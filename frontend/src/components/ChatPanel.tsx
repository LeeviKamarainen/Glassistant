import { useEffect, useRef, useState } from "react";
import { useChat, type AssistantBlock, type DisplayMessage } from "../lib/useChat";
import { useFastMode } from "../lib/useFastMode";
import type { NeedleCall, NeedleReport } from "../lib/types";
import { useVoiceRecorder } from "../lib/useVoiceRecorder";
import { VoiceButton } from "./VoiceButton";

type ToolBlock = Extract<AssistantBlock, { kind: "tool" }>;

const THINKING_WORDS = [
  "Pondering", "Noodling", "Ruminating", "Cogitating", "Mulling it over",
  "Brainstorming", "Scheming", "Daydreaming", "Percolating", "Contemplating",
];

function ToolStepCard({ step }: { step: ToolBlock }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="my-1 rounded border border-white/10 bg-white/5 text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-white/5"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-accent opacity-70">⚙</span>
        <span className="font-mono text-white/60">{step.tool}</span>
        {step.result === undefined && (
          <span className="ml-auto animate-pulse text-white/40">running…</span>
        )}
        {step.result !== undefined && (
          <span className="ml-auto text-white/40">{expanded ? "▲" : "▼"}</span>
        )}
      </button>
      {expanded && step.result !== undefined && (
        <pre className="max-h-32 overflow-auto border-t border-white/10 px-2 py-1 text-white/50 whitespace-pre-wrap break-all">
          {step.result}
        </pre>
      )}
    </div>
  );
}

function CallList({ calls }: { calls: NeedleCall[] }) {
  return (
    <ul className="space-y-0.5">
      {calls.map((c, i) => (
        <li key={i} className="font-mono text-white/60 break-all">
          {c.name}({JSON.stringify(c.arguments)})
        </li>
      ))}
    </ul>
  );
}

/** Collapsible summary of what the Needle fast path proposed and how sure it was. */
function NeedleCard({ report }: { report: NeedleReport }) {
  const [expanded, setExpanded] = useState(false);
  const ran = report.outcome === "executed";
  const confident = report.confidence !== null && report.confidence >= report.threshold;
  return (
    <div className="my-1 rounded border border-white/10 bg-white/5 text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-white/5"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-accent opacity-70">⚡</span>
        <span className="text-white/60">Needle</span>
        <span className={confident ? "text-emerald-300/80" : "text-amber-300/80"}>
          {report.confidence !== null
            ? `${report.confidence.toFixed(2)} / ${report.threshold.toFixed(2)}`
            : "no score"}
        </span>
        <span className="text-white/40">{ran ? "ran" : "→ Ollama"}</span>
        <span className="ml-auto text-white/40">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="space-y-1.5 border-t border-white/10 px-2 py-1.5 text-white/50">
          {report.reason && <div className="text-amber-300/80">Fell back: {report.reason}</div>}
          {report.calls.length > 0 && (
            <div>
              <div className="text-white/35">Proposed</div>
              <CallList calls={report.calls} />
            </div>
          )}
          {report.held.length > 0 && (
            <div>
              <div className="text-white/35">Held back by Needle</div>
              <CallList calls={report.held} />
            </div>
          )}
          {report.calls.length === 0 && report.held.length === 0 && (
            <div className="text-white/35">No tool call proposed.</div>
          )}
          {report.reasoning && <div className="italic">{report.reasoning}</div>}
          <div className="text-white/35">
            {report.ms} ms · confidence must reach {report.threshold.toFixed(2)} to run
          </div>
        </div>
      )}
    </div>
  );
}

function ThinkingBlock({ thinking, done }: { thinking: string; done: boolean }) {
  const [expanded, setExpanded] = useState(!done);
  const [wordIdx, setWordIdx] = useState(0);

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setWordIdx((i) => (i + 1) % THINKING_WORDS.length), 1800);
    return () => clearInterval(id);
  }, [done]);

  const label = done ? "Thinking" : `${THINKING_WORDS[wordIdx]}…`;

  return (
    <div className="my-1 rounded border border-white/10 bg-white/5 text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-white/5"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="opacity-70">💭</span>
        <span className="text-white/60">{label}</span>
        {!done && <span className="ml-auto animate-pulse text-white/40">●</span>}
        {done && <span className="ml-auto text-white/40">{expanded ? "▲" : "▼"}</span>}
      </button>
      {expanded && (
        <pre className="max-h-40 overflow-y-auto overflow-x-hidden border-t border-white/10 px-2 py-1 text-white/50 whitespace-pre-wrap break-words italic">
          {thinking}
        </pre>
      )}
    </div>
  );
}

export function FastToggle({ fast, onChange }: { fast: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={fast}
      onClick={() => onChange(!fast)}
      title="Fast mode: try the small Needle tool-calling model first, fall back to Ollama"
      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
        fast
          ? "border-accent/60 bg-accent/20 text-white"
          : "border-white/15 text-white/40 hover:text-white/70"
      }`}
    >
      <span>⚡</span> Fast
    </button>
  );
}

function StatusLine({ kind, content }: { kind: "info" | "error"; content: string }) {
  return (
    <div
      className={`my-1 flex items-center gap-1.5 px-1 text-xs ${
        kind === "error" ? "text-red-300" : "text-white/40"
      }`}
    >
      <span>{kind === "error" ? "⚠" : "›"}</span>
      <span className={kind === "info" ? "animate-pulse" : ""}>{content}</span>
    </div>
  );
}

export function TranscribingBubble() {
  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[85%] rounded-lg bg-accent/30 px-3 py-2 text-sm text-white/50 animate-pulse flex items-center gap-2">
        <span>🎤</span>
        <span>Transcribing…</span>
      </div>
    </div>
  );
}

export function MessageBubble({ msg, streaming }: { msg: DisplayMessage; streaming: boolean }) {
  if (msg.role === "user") {
    return (
      <div className="flex flex-col items-end mb-3 gap-0.5">
        {msg.voice && (
          <span className="text-[10px] text-white/35 flex items-center gap-1 mr-1">
            🎤 Voice message
          </span>
        )}
        <div className="max-w-[85%] rounded-lg bg-accent/80 px-3 py-2 text-sm leading-relaxed text-white">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[85%]">
        {msg.status && <StatusLine kind={msg.statusKind} content={msg.status} />}
        {msg.blocks.map((block, i) => {
          const isLastBlock = i === msg.blocks.length - 1;
          if (block.kind === "thinking") {
            return <ThinkingBlock key={i} thinking={block.text} done={!(streaming && isLastBlock)} />;
          }
          if (block.kind === "tool") {
            return <ToolStepCard key={i} step={block} />;
          }
          if (block.kind === "needle") {
            return <NeedleCard key={i} report={block} />;
          }
          return (
            <div key={i} className="mb-1 rounded-lg bg-white/10 px-3 py-2 text-sm leading-relaxed text-white/90">
              {block.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [fast, setFast] = useFastMode();
  const { display, streaming, send, cancel, clear } = useChat(fast);
  const scrollRef = useRef<HTMLDivElement>(null);

  const voice = useVoiceRecorder({
    onTranscript: (text) => {
      setVoiceError(null);
      void send(text, true);
    },
    onError: (msg) => setVoiceError(msg),
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [display, voice.state]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
      setDraft("");
    }
  }

  function handleSend() {
    void send(draft);
    setDraft("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:opacity-90"
      >
        <span>✦</span> Ask AI
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[520px] w-[380px] flex-col rounded-xl border border-white/10 bg-[var(--theme-bg)] shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
          <span className="text-accent">✦</span> Glassistant AI
        </div>
        <div className="flex items-center gap-2">
          <FastToggle fast={fast} onChange={setFast} />
          {display.length > 0 && (
            <button
              type="button"
              onClick={clear}
              className="text-xs text-white/40 hover:text-white/70"
              title="Clear conversation"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-white/50 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Message thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {display.length === 0 && (
          <p className="text-center text-xs text-white/30 mt-8">
            Ask me to add, move, or remove widgets.
          </p>
        )}
        {display.map((msg, i) => (
          <MessageBubble key={i} msg={msg} streaming={streaming && i === display.length - 1} />
        ))}
        {voice.state === "transcribing" && <TranscribingBubble />}
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-3">
        {voiceError && (
          <div className="mb-2 rounded px-2 py-1 text-xs text-red-300 bg-red-500/10">
            {voiceError}
          </div>
        )}
        <div className="flex items-end gap-2">
          <VoiceButton
            state={voice.state}
            elapsed={voice.elapsed}
            onStart={voice.start}
            onStop={() => void voice.stop()}
            disabled={streaming}
          />
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={streaming || voice.state !== "idle"}
            placeholder="Ask something… (Enter to send)"
            className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-accent/50 disabled:opacity-50"
          />
          {streaming ? (
            <button
              type="button"
              onClick={cancel}
              className="rounded-lg bg-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/20"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!draft.trim() || voice.state !== "idle"}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
