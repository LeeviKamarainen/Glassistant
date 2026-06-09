import { useEffect, useRef, useState } from "react";
import { streamChat } from "../lib/api";
import type { ChatEvent, ChatMessage } from "../lib/types";

type AssistantBlock =
  | { kind: "thinking"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; tool: string; args: Record<string, unknown>; result?: string };

type ToolBlock = Extract<AssistantBlock, { kind: "tool" }>;

interface AssistantMessage {
  role: "assistant";
  blocks: AssistantBlock[];
  status: string | null;
  statusKind: "info" | "error";
}

const THINKING_WORDS = [
  "Pondering",
  "Noodling",
  "Ruminating",
  "Cogitating",
  "Mulling it over",
  "Brainstorming",
  "Scheming",
  "Daydreaming",
  "Percolating",
  "Contemplating",
];

interface UserMessage {
  role: "user";
  content: string;
}

type DisplayMessage = UserMessage | AssistantMessage;

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

function MessageBubble({ msg, streaming }: { msg: DisplayMessage; streaming: boolean }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[85%] order-1 rounded-lg bg-accent/80 px-3 py-2 text-sm leading-relaxed text-white">
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [display, setDisplay] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [display]);

  async function send() {
    const content = draft.trim();
    if (!content || streaming) return;

    const userMsg: ChatMessage = { role: "user", content };
    const nextMessages = [...messages, userMsg];

    setMessages(nextMessages);
    setDisplay((prev) => [...prev, { role: "user", content }]);
    setDraft("");
    setStreaming(true);

    // Placeholder assistant entry mutated in-place as events arrive
    const assistantEntry: AssistantMessage = {
      role: "assistant",
      blocks: [],
      status: "Connecting to Ollama…",
      statusKind: "info",
    };
    setDisplay((prev) => [...prev, assistantEntry]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      for await (const event of streamChat(nextMessages, abort.signal)) {
        handleEvent(event, assistantEntry);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        assistantEntry.status = "Stopped";
        assistantEntry.statusKind = "info";
      } else {
        assistantEntry.status = e instanceof Error ? e.message : String(e);
        assistantEntry.statusKind = "error";
      }
      setDisplay((prev) => [...prev.slice(0, -1), { ...assistantEntry }]);
    } finally {
      setStreaming(false);
      abortRef.current = null;
      // Persist completed assistant message into chat history
      const finalText = assistantEntry.blocks
        .filter((b): b is Extract<AssistantBlock, { kind: "text" }> => b.kind === "text")
        .map((b) => b.text)
        .join("");
      setMessages((prev) => [...prev, { role: "assistant", content: finalText }]);
    }
  }

  function handleEvent(event: ChatEvent, assistant: AssistantMessage) {
    if (event.type === "error") {
      assistant.status = event.message;
      assistant.statusKind = "error";
      setDisplay((prev) => [...prev.slice(0, -1), { ...assistant }]);
      return;
    }
    if (event.type === "done") return;

    // Any non-error event means the stream is live — clear the "connecting" status.
    if (assistant.status && assistant.statusKind === "info") {
      assistant.status = null;
    }

    const blocks = assistant.blocks;
    const last = blocks[blocks.length - 1];

    if (event.type === "thinking_delta") {
      // Consecutive thinking deltas merge into one block; a gap (tool call,
      // text, or a fresh stream) starts a new one so blocks stay in order.
      if (last?.kind === "thinking") last.text += event.content;
      else blocks.push({ kind: "thinking", text: event.content });
    } else if (event.type === "text_delta") {
      if (last?.kind === "text") last.text += event.content;
      else blocks.push({ kind: "text", text: event.content });
    } else if (event.type === "tool_start") {
      blocks.push({ kind: "tool", tool: event.tool, args: event.args });
    } else if (event.type === "tool_result") {
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        if (b && b.kind === "tool" && b.tool === event.tool && b.result === undefined) {
          b.result = event.result;
          break;
        }
      }
    }

    assistant.blocks = [...blocks];
    setDisplay((prev) => [...prev.slice(0, -1), { ...assistant }]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function cancel() {
    abortRef.current?.abort();
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
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => { setMessages([]); setDisplay([]); }}
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
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={streaming}
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
              onClick={send}
              disabled={!draft.trim()}
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
