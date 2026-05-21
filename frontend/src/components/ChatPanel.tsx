import { useEffect, useRef, useState } from "react";
import { streamChat } from "../lib/api";
import type { ChatEvent, ChatMessage } from "../lib/types";

interface ToolStep {
  tool: string;
  args: Record<string, unknown>;
  result?: string;
}

interface AssistantMessage {
  role: "assistant";
  content: string;
  steps: ToolStep[];
}

interface UserMessage {
  role: "user";
  content: string;
}

type DisplayMessage = UserMessage | AssistantMessage;

function ToolStepCard({ step }: { step: ToolStep }) {
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

function MessageBubble({ msg }: { msg: DisplayMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div className={`max-w-[85%] ${isUser ? "order-1" : ""}`}>
        {msg.role === "assistant" && msg.steps.length > 0 && (
          <div className="mb-1">
            {msg.steps.map((step, i) => (
              <ToolStepCard key={i} step={step} />
            ))}
          </div>
        )}
        {msg.content && (
          <div
            className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
              isUser
                ? "bg-accent/80 text-white"
                : "bg-white/10 text-white/90"
            }`}
          >
            {msg.content}
          </div>
        )}
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
  const [error, setError] = useState<string | null>(null);
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
    setError(null);

    // Placeholder assistant entry mutated in-place as events arrive
    const assistantEntry: AssistantMessage = { role: "assistant", content: "", steps: [] };
    setDisplay((prev) => [...prev, assistantEntry]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      for await (const event of streamChat(nextMessages, abort.signal)) {
        handleEvent(event, assistantEntry);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      // Persist completed assistant message into chat history
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantEntry.content },
      ]);
    }
  }

  function handleEvent(event: ChatEvent, assistant: AssistantMessage) {
    if (event.type === "text_delta") {
      assistant.content += event.content;
      setDisplay((prev) => [...prev.slice(0, -1), { ...assistant }]);
    } else if (event.type === "tool_start") {
      assistant.steps = [...assistant.steps, { tool: event.tool, args: event.args }];
      setDisplay((prev) => [...prev.slice(0, -1), { ...assistant, steps: [...assistant.steps] }]);
    } else if (event.type === "tool_result") {
      const steps = assistant.steps.map((s) =>
        s.tool === event.tool && s.result === undefined ? { ...s, result: event.result } : s,
      );
      assistant.steps = steps;
      setDisplay((prev) => [...prev.slice(0, -1), { ...assistant, steps }]);
    } else if (event.type === "error") {
      setError(event.message);
    }
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
              onClick={() => { setMessages([]); setDisplay([]); setError(null); }}
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
          <MessageBubble key={i} msg={msg} />
        ))}
        {error && (
          <div className="mb-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
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
