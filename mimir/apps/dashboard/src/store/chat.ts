import { Chat } from "@ai-sdk/react";
import type { FileUIPart, UIMessage } from "ai";
import { nanoid } from "nanoid";
import { create } from "zustand";
import { createChatTransport } from "@/components/chat/chat-transport";

export type RateLimitInfo = { limit: number; remaining: number };

export type ConnectedApp = {
  slug: string;
  name: string;
  logo: string | null;
};

interface ChatStoreState {
  chat: Chat<UIMessage>;
  chatId: string;
  inputValue: string;
  chatTitle: string | null;
  rateLimit: RateLimitInfo | null;
  rateLimitExceeded: boolean;
  mentionedApps: ConnectedApp[];

  setInputValue: (v: string) => void;
  addMentionedApp: (app: ConnectedApp) => void;
  removeMentionedApp: (slug: string) => void;
  clearMentionedApps: () => void;
  resetChat: () => void;
  sendMessage: (opts: {
    text: string;
    files?: FileList | FileUIPart[];
  }) => void;
  stop: () => void;
}

const chatTransport = createChatTransport(
  () => useChatStore.getState().mentionedApps,
);

function createChat(id: string): Chat<UIMessage> {
  return new Chat({
    id,
    generateId: nanoid,
    transport: chatTransport,
    onData: (part: unknown) => {
      if (!part || typeof part !== "object") return;
      const dataPart = part as { type?: string; data?: unknown };
      const data =
        dataPart.data && typeof dataPart.data === "object"
          ? (dataPart.data as Record<string, unknown>)
          : null;

      if (dataPart.type === "data-title" && typeof data?.title === "string") {
        useChatStore.setState({ chatTitle: data.title });
      }
      if (
        dataPart.type === "data-rate-limit" &&
        typeof data?.limit === "number" &&
        typeof data.remaining === "number"
      ) {
        useChatStore.setState({
          rateLimit: { limit: data.limit, remaining: data.remaining },
          rateLimitExceeded: false,
        });
      }
    },
    onError: (err) => {
      if (err.message?.includes("RATE_LIMIT_EXCEEDED")) {
        useChatStore.setState({ rateLimitExceeded: true });
        return;
      }
      console.error("Chat error:", err);
    },
  });
}

const initialId = nanoid();

export const useChatStore = create<ChatStoreState>()((set, get) => ({
  chat: createChat(initialId),
  chatId: initialId,
  inputValue: "",
  chatTitle: null,
  rateLimit: null,
  rateLimitExceeded: false,
  mentionedApps: [],

  setInputValue: (v) => set({ inputValue: v }),

  addMentionedApp: (app) => {
    const { mentionedApps } = get();
    if (mentionedApps.some((a) => a.slug === app.slug)) return;
    set({ mentionedApps: [...mentionedApps, app] });
  },

  removeMentionedApp: (slug) => {
    set({ mentionedApps: get().mentionedApps.filter((a) => a.slug !== slug) });
  },

  clearMentionedApps: () => set({ mentionedApps: [] }),

  resetChat: () => {
    const id = nanoid();
    set({
      chat: createChat(id),
      chatId: id,
      chatTitle: null,
      inputValue: "",
      rateLimit: null,
      rateLimitExceeded: false,
      mentionedApps: [],
    });
  },

  sendMessage: (opts) => get().chat.sendMessage(opts),
  stop: () => get().chat.stop(),
}));
