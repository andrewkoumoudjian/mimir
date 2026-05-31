import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import {
  applyReviewDecision,
  exportTransactions,
  fetchMimirSummary,
  fetchMimirSyntheticLiveFeed,
  fetchMimirTransactionContext,
  getLiveNotifications,
  getOverviewSummary,
  getTransactions,
  globalSearch,
} from "@/lib/mimir/client";
import type {
  MiddayLikeTransaction,
  MimirReason,
  MimirReviewStatus,
  MimirRiskLevel,
} from "@/lib/mimir/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHAT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  appName: "Mimir",
  appUrl: process.env.NEXT_PUBLIC_URL ?? "http://localhost:3001",
  compatibility: "strict",
});

type ChatRequestBody = {
  messages?: UIMessage[];
  mentionedApps?: Array<{ slug: string; name: string }>;
  timezone?: string;
  localTime?: string;
};

function compactReason(reason: MimirReason) {
  return {
    code: reason.code,
    severity: reason.severity,
    message: reason.message,
    priority: reason.priority,
    evidence: reason.evidence,
  };
}

function compactTransaction(transaction: MiddayLikeTransaction) {
  return {
    id: transaction.id,
    date: transaction.date,
    amount: transaction.amount,
    currency: transaction.currency,
    merchantName: transaction.merchantName,
    merchantCategory: transaction.merchantCategory,
    cardId: transaction.cardId,
    channel: transaction.channel,
    cardholderCountry: transaction.cardholderCountry,
    merchantCountry: transaction.merchantCountry,
    riskScore: transaction.riskScore,
    riskLevel: transaction.riskLevel,
    reviewStatus: transaction.reviewStatus,
    recommendedAction: transaction.recommendedAction,
    primaryPattern: transaction.primaryPattern,
    componentScores: transaction.componentScores,
    reasons: transaction.reasons.slice(0, 5).map(compactReason),
    link: `#txn:${transaction.id}`,
  };
}

function buildSystemPrompt(body: ChatRequestBody) {
  const mentionedApps = body.mentionedApps?.length
    ? body.mentionedApps.map((app) => `${app.name} (${app.slug})`).join(", ")
    : "none";

  return `You are Mimir, a fraud detection, compliance, and reporting assistant for the Mimir dashboard.

Use the available tools for live dashboard data. Do not invent transaction details, risk scores, review statuses, report numbers, or API state.

Context:
- User timezone: ${body.timezone ?? "UTC"}
- User local time: ${body.localTime ?? new Date().toISOString()}
- Mentioned connected apps: ${mentionedApps}

Tool guidance:
- Use reports_profit_loss for portfolio or model-level fraud/compliance summaries.
- Use transactions_list, transactions_search, and transactions_get for transaction questions.
- Use transactions_update only when the user explicitly asks to approve, dismiss, escalate, decline, or block a specific transaction.
- Use transactions_export only when the user explicitly asks to export specific transactions.
- Use inbox_live_feed for live synthetic fraud-feed questions.
- Ask for clarification before mutating data when transaction IDs or intended review actions are ambiguous.

Navigation/linking:
- Link transactions as [transaction_id](#txn:transaction_id).
- Link dashboard pages with #navigate paths, for example [Transactions](#navigate:/transactions), [Reports](#navigate:/reports), and [Live inbox](#navigate:/inbox/live).

Keep responses concise and action-oriented.`;
}

const riskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
const reviewStatusSchema = z.enum([
  "pending",
  "approved",
  "dismissed",
  "escalated",
  "declined",
  "blocked",
]);
const reviewActionSchema = z.enum([
  "approve",
  "dismiss",
  "escalate",
  "decline",
  "block",
]);

const tools = {
  reports_profit_loss: tool({
    description:
      "Get the current Mimir fraud, compliance, and reporting summary from the API.",
    inputSchema: z.object({}),
    execute: async () => {
      const [summary, overview] = await Promise.all([
        fetchMimirSummary(),
        getOverviewSummary(),
      ]);

      return {
        summary,
        overview,
      };
    },
  }),

  transactions_list: tool({
    description:
      "List transactions from the Mimir API with optional fraud and review filters.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe(
          "Text to search by merchant, transaction id, reason, or card.",
        ),
      riskLevels: z.array(riskLevelSchema).optional(),
      reviewStatuses: z.array(reviewStatusSchema).optional(),
      cardId: z.string().optional(),
      merchantName: z.string().optional(),
      merchantCategory: z.string().optional(),
      channel: z.string().optional(),
      minRiskScore: z.number().min(0).max(1).optional(),
      maxRiskScore: z.number().min(0).max(1).optional(),
      flaggedOnly: z.boolean().optional(),
      pageSize: z.number().int().min(1).max(25).default(10),
    }),
    execute: async ({
      query,
      riskLevels,
      reviewStatuses,
      cardId,
      merchantName,
      merchantCategory,
      channel,
      minRiskScore,
      maxRiskScore,
      flaggedOnly,
      pageSize,
    }) => {
      const hasScoreRange =
        typeof minRiskScore === "number" || typeof maxRiskScore === "number";
      const response = await getTransactions({
        q: query,
        risk_level: riskLevels as MimirRiskLevel[] | undefined,
        review_status: reviewStatuses as MimirReviewStatus[] | undefined,
        card_id: cardId,
        merchant_name: merchantName,
        merchant_category: merchantCategory,
        channel,
        score_range: hasScoreRange
          ? [minRiskScore ?? 0, maxRiskScore ?? 1]
          : undefined,
        fulfilled: flaggedOnly ? true : undefined,
        exported: flaggedOnly ? false : undefined,
        pageSize,
      });

      return {
        transactions: response.data.map(compactTransaction),
        meta: response.meta,
      };
    },
  }),

  transactions_get: tool({
    description:
      "Get detailed Mimir API context for one transaction, including graph, timeline, and related transactions.",
    inputSchema: z.object({
      transactionId: z.string().describe("The exact transaction id."),
    }),
    execute: async ({ transactionId }) => {
      const context = await fetchMimirTransactionContext(transactionId);

      return {
        transaction: context.transaction,
        links: context.links.slice(0, 25),
        cardTimeline: context.card_timeline.slice(0, 20),
        relatedTransactions: context.related_transactions,
        graph: {
          nodes: context.graph.nodes.slice(0, 40),
          edges: context.graph.edges.slice(0, 80),
        },
      };
    },
  }),

  transactions_search: tool({
    description:
      "Search Mimir API transactions and return dashboard-ready result links.",
    inputSchema: z.object({
      searchTerm: z.string().describe("Search term for transaction lookup."),
    }),
    execute: async ({ searchTerm }) => {
      return {
        results: await globalSearch({ searchTerm }),
      };
    },
  }),

  transactions_update: tool({
    description:
      "Apply a Mimir review decision to one transaction through the API.",
    inputSchema: z.object({
      transactionId: z.string().describe("The exact transaction id to update."),
      action: reviewActionSchema,
      reviewerConfidence: z.number().min(0).max(1).optional(),
      note: z.string().optional(),
    }),
    execute: async ({ transactionId, action, reviewerConfidence, note }) => {
      return applyReviewDecision({
        transactionId,
        action,
        reviewer: "mimir_assistant",
        reviewerConfidence,
        note,
      });
    },
  }),

  transactions_export: tool({
    description: "Export specific reviewed transactions through the Mimir API.",
    inputSchema: z.object({
      transactionIds: z.array(z.string()).min(1).max(25),
    }),
    execute: async ({ transactionIds }) => {
      return exportTransactions({ transactionIds });
    },
  }),

  inbox_list: tool({
    description:
      "Read the latest Mimir audit and review queue notifications from the API.",
    inputSchema: z.object({
      status: z.array(z.string()).optional(),
      pageSize: z.number().int().min(1).max(20).default(10),
    }),
    execute: async ({ status, pageSize }) => {
      return getLiveNotifications({ status, pageSize });
    },
  }),

  search_global: tool({
    description:
      "Run global Mimir dashboard search over available API-backed entities.",
    inputSchema: z.object({
      searchTerm: z
        .string()
        .describe("Search term to find dashboard entities."),
    }),
    execute: async ({ searchTerm }) => {
      return {
        results: await globalSearch({ searchTerm }),
      };
    },
  }),

  inbox_live_feed: tool({
    description:
      "Get a small synthetic live transaction window from the Mimir API for live fraud-monitoring questions.",
    inputSchema: z.object({
      cursor: z.number().int().min(0).optional(),
      count: z.number().int().min(1).max(12).default(3),
    }),
    execute: async ({ cursor, count }) => {
      return fetchMimirSyntheticLiveFeed({ cursor, count });
    },
  }),
};

export async function POST(request: Request) {
  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as ChatRequestBody;

  if (!Array.isArray(body.messages)) {
    return Response.json({ error: "Missing messages." }, { status: 400 });
  }

  const result = streamText({
    model: openrouter.chat(CHAT_MODEL),
    system: buildSystemPrompt(body),
    messages: await convertToModelMessages(body.messages),
    tools,
    stopWhen: stepCountIs(5),
    temperature: 0.2,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: body.messages,
    onError: () => "Unable to complete the chat request.",
  });
}
