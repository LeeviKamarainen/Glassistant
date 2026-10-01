import { useRef, useState } from "react";
import { streamChat } from "./api";
import type { ChatMessage, ChatEvent } from "./types";

export type AssistantBlock =
  | { kind: "thinking"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; tool: string; args: Record<string, unknown>; result?: string };

export interface AssistantMessage {
  role: "assistant";
  blocks: AssistantBlock[];
  status: string | null;
  statusKind: "info" | "error";
}

export interface UserMessage {
  role: "user";
  content: string;
  voice?: boolean;
}

export type DisplayMessage = UserMessage | AssistantMessage;

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [display, setDisplay] = useState<DisplayMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function handleEvent(event: ChatEvent, assistant: AssistantMessage) {
    if (event.type === "error") {
      assistant.status = event.message;
      assistant.statusKind = "error";
      setDisplay((prev) => [...prev.slice(0, -1), { ...assistant }]);
      return;
    }
    if (event.type === "done") return;

    if (assistant.status && assistant.statusKind === "info") {
      assistant.status = null;
    }

    const blocks = assistant.blocks;
    const last = blocks[blocks.length - 1];

    if (event.type === "thinking_delta") {
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

  async function send(content: string, voice = false) {
    if (!content.trim() || streaming) return;

    const userMsg: ChatMessage = { role: "user", content };
    const nextMessages = [...messages, userMsg];

    setMessages(nextMessages);
    setDisplay((prev) => [...prev, { role: "user", content, voice }]);
    setStreaming(true);

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
      const finalText = assistantEntry.blocks
        .filter((b): b is Extract<AssistantBlock, { kind: "text" }> => b.kind === "text")
        .map((b) => b.text)
        .join("");
      setMessages((prev) => [...prev, { role: "assistant", content: finalText }]);
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function clear() {
    setMessages([]);
    setDisplay([]);
  }

  return { display, streaming, send, cancel, clear };
}
