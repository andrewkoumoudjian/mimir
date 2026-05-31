"use client";

import { useChat } from "@ai-sdk/react";
import { LogEvents } from "@midday/events/events";
import { useOpenPanel } from "@openpanel/nextjs";
import type { UIMessage } from "ai";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { createChatTransport } from "./chat-transport";

export type RateLimitInfo = { limit: number; remaining: number };

export type ConnectedApp = {
  slug: string;
  name: string;
  logo: string | null;
};

export type ChatState = ReturnType<typeof useChat<UIMessage>> & {
  inputValue: string;
  setInputValue: (v: string) => void;
  chatTitle: string | null;
  setChatTitle: (v: string | null) => void;
  rateLimit: RateLimitInfo | null;
  rateLimitExceeded: boolean;
  mentionedApps: ConnectedApp[];
  addMentionedApp: (app: ConnectedApp) => void;
  removeMentionedApp: (slug: string) => void;
  clearMentionedApps: () => void;
};

const ChatContext = createContext<ChatState | null>(null);

export function useChatState() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatState must be used within ChatProvider");
  return ctx;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { track } = useOpenPanel();

  const [inputValue, setInputValue] = useState("");
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [rateLimitExceeded, setRateLimitExceeded] = useState(false);
  const [mentionedApps, setMentionedApps] = useState<ConnectedApp[]>([]);

  const mentionedAppsRef = useRef(mentionedApps);
  mentionedAppsRef.current = mentionedApps;

  const addMentionedApp = useCallback((app: ConnectedApp) => {
    setMentionedApps((prev) => {
      if (prev.some((a) => a.slug === app.slug)) return prev;
      return [...prev, app];
    });
  }, []);

  const removeMentionedApp = useCallback((slug: string) => {
    setMentionedApps((prev) => prev.filter((a) => a.slug !== slug));
  }, []);

  const clearMentionedApps = useCallback(() => {
    setMentionedApps([]);
  }, []);

  const chatTransport = useMemo(
    () => createChatTransport(() => mentionedAppsRef.current),
    [],
  );

  const chat = useChat({
    transport: chatTransport,
    onData: (part: unknown) => {
      if (!part || typeof part !== "object") return;
      const dataPart = part as { type?: string; data?: unknown };
      const data =
        dataPart.data && typeof dataPart.data === "object"
          ? (dataPart.data as Record<string, unknown>)
          : null;

      if (dataPart.type === "data-title" && typeof data?.title === "string") {
        setChatTitle(data.title);
      }
      if (
        dataPart.type === "data-rate-limit" &&
        typeof data?.limit === "number" &&
        typeof data.remaining === "number"
      ) {
        setRateLimit({ limit: data.limit, remaining: data.remaining });
        setRateLimitExceeded(false);
      }
    },
    onError: (err) => {
      if (err.message?.includes("RATE_LIMIT_EXCEEDED")) {
        setRateLimitExceeded(true);
        return;
      }
      console.error("Chat error:", err);
    },
  });

  const trackedSendMessage: typeof chat.sendMessage = useCallback(
    (...args) => {
      if (LogEvents.AssistantMessageSent) {
        track(LogEvents.AssistantMessageSent.name);
      }
      return chat.sendMessage(...args);
    },
    [chat.sendMessage, track],
  );

  return (
    <ChatContext.Provider
      value={{
        ...chat,
        sendMessage: trackedSendMessage,
        inputValue,
        setInputValue,
        chatTitle,
        setChatTitle,
        rateLimit,
        rateLimitExceeded,
        mentionedApps,
        addMentionedApp,
        removeMentionedApp,
        clearMentionedApps,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
