"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useRef,
  useState,
} from "react";
import { KcAiRequestError, requestKcAi } from "@/lib/kc-ai-client";
import { answerKcAi } from "@/lib/kc-ai-knowledge";

export type KcAiChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
};

type KcAiContextValue = {
  open: boolean;
  setOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  input: string;
  setInput: (input: string) => void;
  messages: KcAiChatMessage[];
  typing: boolean;
  send: (question: string) => Promise<void>;
  clearConversation: () => void;
};

const KcAiContext = createContext<KcAiContextValue | null>(null);

function friendlyFailure(error: unknown) {
  if (!(error instanceof KcAiRequestError)) return "KC AI 暫時無法連線，先提供本地操作說明：";
  if (error.code === "KC_AI_RATE_LIMITED") {
    const wait = error.retryAfterSeconds ? `約 ${error.retryAfterSeconds} 秒後` : "稍後";
    return `詢問速度有點快，請${wait}再試。先提供本地操作說明：`;
  }
  if (error.code === "KC_AI_INVALID_HISTORY" || error.code === "KC_AI_HISTORY_TOO_LONG") {
    return "對話內容暫時無法送出，先提供本地操作說明：";
  }
  if (error.code === "KC_AI_TIMEOUT") return "KC AI 回應時間較長，先提供本地操作說明：";
  if (error.code === "KC_AI_UPSTREAM_ERROR" || error.code === "KC_AI_INCOMPLETE_RESPONSE") {
    return "KC AI 目前回應不完整，先提供本地操作說明：";
  }
  return "KC AI 連線暫時無法使用，先提供本地操作說明：";
}

export function KcAiProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<KcAiChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const nextId = useRef(1);
  const requestSequence = useRef(0);

  async function send(question: string) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || typing) return;
    const requestId = ++requestSequence.current;
    const history = messages.slice(-8).map((message) => ({
      role: message.role,
      content: message.text,
    }));
    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: "user", text: cleanQuestion },
    ]);
    setInput("");
    setTyping(true);
    try {
      const reply = await requestKcAi(cleanQuestion, history);
      if (requestId !== requestSequence.current) return;
      setMessages((current) => [
        ...current,
        { id: nextId.current++, role: "assistant", text: reply },
      ]);
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          role: "assistant",
          text: `${friendlyFailure(error)}\n\n${answerKcAi(cleanQuestion)}`,
        },
      ]);
    } finally {
      if (requestId === requestSequence.current) setTyping(false);
    }
  }

  function clearConversation() {
    requestSequence.current += 1;
    setTyping(false);
    setMessages([]);
    setInput("");
  }

  return (
    <KcAiContext.Provider value={{
      open,
      setOpen,
      input,
      setInput,
      messages,
      typing,
      send,
      clearConversation,
    }}>
      {children}
    </KcAiContext.Provider>
  );
}

export function useKcAi() {
  const context = useContext(KcAiContext);
  if (!context) throw new Error("KC AI provider is missing");
  return context;
}
