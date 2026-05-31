"use client";

import { DefaultChatTransport } from "ai";
import type { ConnectedApp } from "@/components/chat/chat-context";
import { getAccessToken } from "@/utils/session";

type MentionedAppsResolver = () => ConnectedApp[];

function getChatApiUrl() {
  return process.env.NEXT_PUBLIC_CHAT_API_URL || "/api/chat";
}

export function createChatTransport(getMentionedApps: MentionedAppsResolver) {
  return new DefaultChatTransport({
    api: getChatApiUrl(),
    headers: async () => {
      const token = await getAccessToken();
      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

      return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "x-user-timezone": timezone,
      } as Record<string, string>;
    },
    body: () => ({
      mentionedApps: getMentionedApps().map((app) => ({
        slug: app.slug,
        name: app.name,
      })),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      localTime: new Date().toISOString(),
    }),
  });
}
