import { NextResponse } from "next/server";
import { buildAssistantSystemPrompt } from "@/lib/assistant/build-grounding-context";
import {
  getExpectedPolicyDocumentPaths,
  loadPolicyDocument,
} from "@/lib/policy/load-policy-document";
import { getDashboardData } from "@/lib/transactions/get-dashboard-data";
import type {
  AssistantConversationMessage,
  AssistantReply,
  AssistantRequestBody,
} from "@/types/assistant";

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const MAX_HISTORY_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 2_000;

type AnthropicResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured for the assistant route." },
      { status: 503 },
    );
  }

  let body: AssistantRequestBody;

  try {
    body = (await request.json()) as AssistantRequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const messages = sanitizeMessages(body?.messages);
  const latestMessage = messages.at(-1);

  if (!latestMessage || latestMessage.role !== "user") {
    return NextResponse.json(
      { error: "A non-empty message list ending in a user message is required." },
      { status: 400 },
    );
  }

  const dashboard = await getDashboardData();
  const policyDocument = await loadPolicyDocument();

  if (!policyDocument) {
    const { pdfPath, textPath } = getExpectedPolicyDocumentPaths();
    return NextResponse.json(
      {
        error: `Assistant grounding requires a real Brim policy source document. Add ${pdfPath} or ${textPath} before asking Claude policy-grounded questions.`,
      },
      { status: 503 },
    );
  }

  const systemPrompt = buildAssistantSystemPrompt(messages, dashboard, policyDocument);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: 1200,
      system: systemPrompt,
      messages,
    }),
  });

  const payload = (await response.json()) as AnthropicResponse;

  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          payload.error?.message ??
          "Claude returned an error while answering the grounded workbook question.",
      },
      { status: response.status },
    );
  }

  const reply = payload.content
    ?.filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");

  if (!reply) {
    return NextResponse.json(
      { error: "Claude returned an empty response for this question." },
      { status: 502 },
    );
  }

  const assistantReply: AssistantReply = {
    reply,
    model: DEFAULT_MODEL,
  };

  return NextResponse.json(assistantReply);
}

function sanitizeMessages(input: unknown): AssistantConversationMessage[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter(
      (message): message is AssistantConversationMessage =>
        Boolean(message) &&
        typeof message === "object" &&
        "role" in message &&
        "content" in message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string",
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_MESSAGE_LENGTH),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-MAX_HISTORY_MESSAGES);
}
