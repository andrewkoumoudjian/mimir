import { buildExpenseReports } from "@/lib/expense-reports/build-expense-reports";
import {
  buildTransactionClusterResult,
  extractMonthYear,
  extractRequestedReportType,
  extractTransactionClusterAmountBounds,
  REPORT_TYPE_KEYWORDS,
  transactionMatchesReportType,
} from "@/lib/assistant/build-transaction-cluster";
import { formatCurrency, formatPercent } from "@/lib/transactions/format";
import type { AssistantConversationMessage } from "@/types/assistant";
import type { ExpenseReport } from "@/types/expense-report";
import type { PolicyDocument } from "@/lib/policy/load-policy-document";
import type { TransactionClusterQuery, TransactionClusterResult } from "@/types/transaction-cluster";
import type {
  ComplianceFlag,
  DashboardData,
  NormalizedTransaction,
} from "@/types/transactions";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "be",
  "by",
  "can",
  "for",
  "from",
  "give",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "or",
  "show",
  "summarize",
  "tell",
  "the",
  "this",
  "to",
  "what",
  "which",
  "with",
]);

const MAX_RELEVANT_TRANSACTIONS = 8;
const MAX_RELEVANT_FLAGS = 8;
const MAX_LARGEST_TRANSACTIONS = 3;
const MAX_FLAG_HIGHLIGHTS = 4;
const MAX_POLICY_CHUNKS = 4;
const MAX_RELEVANT_REPORTS = 3;
const MAX_SCOPED_TRANSACTIONS = 40;
const DEFAULT_CLUSTER_PREVIEW_TRANSACTIONS = 12;
const EXTENDED_CLUSTER_PREVIEW_TRANSACTIONS = 40;

export function buildAssistantSystemPrompt(
  messages: AssistantConversationMessage[],
  dashboard: DashboardData,
  policyDocument: PolicyDocument,
): string {
  const latestQuestion =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const conversationQuestion = buildConversationQuestion(messages);
  const question = latestQuestion || conversationQuestion;
  const questionLower = question.toLowerCase();
  const keywords = extractKeywords(question);
  const expenseReports = buildExpenseReports(dashboard.transactions, dashboard.compliance.flags);
  const scopedContext = resolveScopedTransactionContext(messages, dashboard.transactions, expenseReports);
  const shouldPreferScopedTransactions = scopedContext.source !== "none";
  const relevantTransactions = shouldPreferScopedTransactions
    ? []
    : findRelevantTransactions(question, dashboard.transactions);
  const relevantFlags = findRelevantFlags(question, dashboard.compliance.flags);
  const relevantPolicyChunks = findRelevantPolicyChunks(question, keywords, policyDocument);
  const relevantReports = findRelevantReports(question, keywords, expenseReports);
  const largestTransactions = [...dashboard.transactions]
    .filter((transaction) => transaction.amount > 0)
    .sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date))
    .slice(0, MAX_LARGEST_TRANSACTIONS);
  const highlightedRiskFlags = dashboard.compliance.flags
    .filter((flag) => flag.classification === "risk")
    .slice(0, MAX_FLAG_HIGHLIGHTS);
  const topFlagTypes = dashboard.compliance.summary.flagTypeCounts.slice(0, 5);
  const topMerchants = dashboard.summary.topMerchants.slice(0, 5);
  const reportStatusCounts = summarizeReportStatuses(expenseReports);
  const topReportTypes = summarizeReportTypes(expenseReports);
  const recentUserMessages = messages.filter((message) => message.role === "user");
  const shouldIncludePolicyContext = isPolicyQuestion(questionLower, keywords);
  const shouldIncludeMerchantContext =
    !shouldPreferScopedTransactions && isMerchantOrSpendQuestion(questionLower, keywords);
  const shouldIncludeRiskContext = isRiskQuestion(questionLower, keywords);
  const shouldIncludeInsightContext =
    !shouldPreferScopedTransactions && isOverviewQuestion(questionLower, keywords);
  const shouldIncludeReportContext =
    !shouldPreferScopedTransactions && isReportQuestion(questionLower, keywords);

  const promptSections = [
    [
      "You are the Brim Expense Intelligence finance copilot.",
      "Answer like a helpful chat assistant, not a report writer.",
      "Start with the direct answer in the first sentence.",
      "Keep replies concise by default.",
      "Use plain text only.",
      "Do not use markdown headings, tables, bold markers, or decorative formatting.",
      "Only use short hyphen bullets when a list genuinely makes the answer clearer.",
      "Give more detail only if the user asks for it.",
      "Do not repeat safety or provenance reminders unless they matter to the answer.",
      "Answer only from the workbook, the repo-backed policy document, and deterministic outputs derived from them.",
      "Do not invent transactions, policy rules, approvals, receipts, employees, reimbursements, or workflow history.",
      "Treat deterministic engine outputs as source-of-truth interpretations of the source documents.",
      "When the server provides a scoped transaction list for the user's request, use that list as the primary evidence for the answer.",
      "When scoped transactions are present, keep counts, totals, lists, and thresholds strictly limited to that scoped set unless the user explicitly broadens the question.",
      "For large transaction clusters, give the exact match count and total amount first, then show only a compact preview unless the user explicitly asks for more rows.",
      "If a scoped preview is truncated, say that clearly and invite a follow-up such as filtering further or continuing the list.",
      "If the user explicitly asks for the full list, return the provided preview rows directly instead of refusing, while noting if the chat-safe preview is still truncated.",
      "Never say you have shown the full or complete list when the scoped preview is marked as truncated.",
      "If the grounded context is not enough, say so briefly.",
    ].join("\n"),
    [
      "Core context:",
      `- Dataset: ${dashboard.source.datasetName}`,
      `- Transactions: ${dashboard.summary.transactionCount}`,
      `- Date range: ${dashboard.summary.startDate} to ${dashboard.summary.endDate}`,
      `- Risk alerts: ${dashboard.compliance.summary.classificationCounts.risk}`,
      `- Workflow items: ${dashboard.compliance.summary.classificationCounts.workflow}`,
      `- Info items: ${dashboard.compliance.summary.classificationCounts.info}`,
      `- High severity flags: ${dashboard.compliance.summary.severityCounts.high}`,
      `- Policy source: ${policyDocument.sourcePath}`,
    ].join("\n"),
  ];

  if (recentUserMessages.length > 0) {
    promptSections.push(
      [
        "Recent user questions:",
        ...recentUserMessages.map((message) => `- ${message.content}`),
      ].join("\n"),
    );
  }

  if (shouldPreferScopedTransactions) {
    promptSections.push(
      [
        "Resolved transaction scope for the current request:",
        `- Scope label: ${scopedContext.label}`,
        `- Matching transactions: ${scopedContext.totalMatches}`,
        `- Scope total: ${formatCurrency(scopedContext.totalAmount)}`,
        `- Scope source: ${scopedContext.source}`,
        `- Preview rows provided: ${scopedContext.transactions.length}`,
        `- Preview truncated: ${scopedContext.isTruncated ? "yes" : "no"}`,
        ...scopedContext.appliedFilters.map((filter) => `- Applied filter: ${filter}`),
      ].join("\n"),
    );

    promptSections.push(
      [
        "Scoped transactions:",
        ...(scopedContext.transactions.length > 0
          ? scopedContext.transactions.map(summarizeTransaction)
          : ["- None matched directly for this scoped request."]),
      ].join("\n"),
    );
  }

  if (shouldIncludeMerchantContext) {
    promptSections.push(
      [
        "Merchant and spend context:",
        ...topMerchants.map(
          (merchant) =>
            `- ${merchant.merchant}: ${formatCurrency(merchant.totalSpend)} (${formatPercent(
              merchant.shareOfSpend,
            )} of spend)`,
        ),
      ].join("\n"),
    );
  }

  if (shouldIncludeInsightContext) {
    promptSections.push(
      [
        "Relevant dashboard insights:",
        ...dashboard.insights.map((insight) => `- ${insight.title} ${insight.detail}`),
      ].join("\n"),
    );
  }

  if (shouldIncludeRiskContext) {
    promptSections.push(
      [
        "Risk and compliance context:",
        `- Total flags: ${dashboard.compliance.summary.totalFlags}`,
        `- Flagged transactions: ${dashboard.compliance.summary.flaggedTransactionCount}`,
        ...topFlagTypes.map(
          (flagType) => `- ${formatFlagType(flagType.flagType)}: ${flagType.count}`,
        ),
      ].join("\n"),
    );

    if (highlightedRiskFlags.length > 0) {
      promptSections.push(
        [
          "Representative risk alerts:",
          ...highlightedRiskFlags.map(summarizeFlag),
        ].join("\n"),
      );
    }

    if (largestTransactions.length > 0) {
      promptSections.push(
        [
          "Largest transactions:",
          ...largestTransactions.map(summarizeTransaction),
        ].join("\n"),
      );
    }
  }

  if (shouldIncludePolicyContext) {
    promptSections.push(
      [
        relevantPolicyChunks.length > 0
          ? "Relevant policy excerpts:"
          : "Relevant policy excerpts: no direct keyword match found",
        ...relevantPolicyChunks.map((chunk) => `- ${chunk.text}`),
      ].join("\n"),
    );
  }

  if (relevantTransactions.length > 0) {
    promptSections.push(
      [
        "Question-matched transactions:",
        ...(shouldPreferScopedTransactions
          ? relevantTransactions
              .filter(
                (transaction) =>
                  !scopedContext.transactions.some((scoped) => scoped.id === transaction.id),
              )
              .map(summarizeTransaction)
          : relevantTransactions.map(summarizeTransaction)),
      ].join("\n"),
    );
  }

  if (relevantFlags.length > 0) {
    promptSections.push(
      [
        "Question-matched compliance flags:",
        ...relevantFlags.map(summarizeFlag),
      ].join("\n"),
    );
  }

  if (shouldIncludeReportContext) {
    promptSections.push(
      [
        "Expense report context:",
        `- Generated reports: ${expenseReports.length}`,
        `- Ready: ${reportStatusCounts.ready}`,
        `- Review: ${reportStatusCounts.review}`,
        `- Investigate: ${reportStatusCounts.investigate}`,
        ...topReportTypes.map((entry) => `- ${formatReportType(entry.type)}: ${entry.count}`),
      ].join("\n"),
    );

    if (relevantReports.length > 0) {
      promptSections.push(
        [
          "Question-matched expense reports:",
          ...relevantReports.map(summarizeReport),
        ].join("\n"),
      );
    }
  }

  return promptSections.join("\n\n");
}

type ScopedTransactionContext = {
  label: string;
  transactions: NormalizedTransaction[];
  totalMatches: number;
  totalAmount: number;
  appliedFilters: string[];
  isTruncated: boolean;
  source: "cluster" | "report" | "scope" | "none";
};

type ConversationScope = {
  monthYear: string | null;
  reportType: ExpenseReport["type"] | null;
  clusterQuery: TransactionClusterQuery | null;
  fullListRequested: boolean;
};

function buildConversationQuestion(messages: AssistantConversationMessage[]) {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join(" ");
}

function findRelevantTransactions(
  question: string,
  transactions: NormalizedTransaction[],
): NormalizedTransaction[] {
  const keywords = extractKeywords(question);

  if (keywords.length === 0) {
    return [];
  }

  return transactions
    .map((transaction) => ({
      transaction,
      score: scoreTransaction(transaction, keywords),
    }))
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.transaction.date.localeCompare(a.transaction.date) ||
        b.transaction.amount - a.transaction.amount,
    )
    .slice(0, MAX_RELEVANT_TRANSACTIONS)
    .map((item) => item.transaction);
}

function findRelevantFlags(question: string, flags: ComplianceFlag[]): ComplianceFlag[] {
  const keywords = extractKeywords(question);

  if (keywords.length === 0) {
    return [];
  }

  return flags
    .map((flag) => ({
      flag,
      score: scoreFlag(flag, keywords),
    }))
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        severityRank(a.flag.severity) - severityRank(b.flag.severity) ||
        b.flag.date.localeCompare(a.flag.date) ||
        b.flag.amount - a.flag.amount,
    )
    .slice(0, MAX_RELEVANT_FLAGS)
    .map((item) => item.flag);
}

function extractKeywords(question: string) {
  return [...new Set(
    question
      .toLowerCase()
      .split(/[^a-z0-9.-]+/)
      .map((part) => part.trim())
      .filter(
        (part) =>
          part.length >= 2 &&
          !STOP_WORDS.has(part),
      ),
  )];
}

function scoreTransaction(transaction: NormalizedTransaction, keywords: string[]) {
  const merchant = transaction.merchant.toLowerCase();
  const description = transaction.description.toLowerCase();
  const category = (transaction.category ?? "").toLowerCase();
  const country = (transaction.country ?? "").toLowerCase();
  const date = transaction.date.toLowerCase();
  const amount = `${transaction.amount}`.toLowerCase();

  return keywords.reduce((score, keyword) => {
    let nextScore = score;

    if (merchant.includes(keyword)) {
      nextScore += 4;
    }

    if (description.includes(keyword)) {
      nextScore += 3;
    }

    if (category.includes(keyword) || country.includes(keyword) || date.includes(keyword)) {
      nextScore += 2;
    }

    if (amount.includes(keyword)) {
      nextScore += 1;
    }

    return nextScore;
  }, 0);
}

function scoreFlag(flag: ComplianceFlag, keywords: string[]) {
  const merchant = flag.merchant.toLowerCase();
  const flagType = formatFlagType(flag.flagType).toLowerCase();
  const explanation = flag.explanation.toLowerCase();
  const details = flag.details.join(" ").toLowerCase();
  const classification = flag.classification.toLowerCase();
  const severity = flag.severity.toLowerCase();
  const date = flag.date.toLowerCase();
  const amount = `${flag.amount}`.toLowerCase();

  return keywords.reduce((score, keyword) => {
    let nextScore = score;

    if (merchant.includes(keyword) || flagType.includes(keyword)) {
      nextScore += 4;
    }

    if (explanation.includes(keyword) || details.includes(keyword)) {
      nextScore += 3;
    }

    if (classification.includes(keyword) || severity.includes(keyword) || date.includes(keyword)) {
      nextScore += 2;
    }

    if (amount.includes(keyword)) {
      nextScore += 1;
    }

    return nextScore;
  }, 0);
}

function summarizeTransaction(transaction: NormalizedTransaction) {
  return `- ${transaction.date} | ${transaction.merchant} | ${formatCurrency(
    transaction.amount,
  )} | ${transaction.category ?? "Unmapped"} | ${transaction.country ?? "Unknown"} | ${
    transaction.description
  }`;
}

function summarizeFlag(flag: ComplianceFlag) {
  return `- ${flag.date} | ${flag.merchant} | ${formatCurrency(flag.amount)} | ${formatClassification(
    flag.classification,
  )} | ${capitalize(flag.severity)} | ${formatFlagType(flag.flagType)} | ${flag.explanation}`;
}

function resolveScopedTransactionContext(
  messages: AssistantConversationMessage[],
  transactions: NormalizedTransaction[],
  reports: ExpenseReport[],
): ScopedTransactionContext {
  const conversationScope = resolveConversationScope(messages);
  const previewLimit = conversationScope.fullListRequested
    ? EXTENDED_CLUSTER_PREVIEW_TRANSACTIONS
    : DEFAULT_CLUSTER_PREVIEW_TRANSACTIONS;
  const clusterResult = conversationScope.clusterQuery
    ? buildTransactionClusterResult(transactions, conversationScope.clusterQuery, previewLimit)
    : null;

  if (clusterResult) {
    return scopedContextFromClusterResult(clusterResult);
  }

  const matchedReport = findReportForScope(conversationScope, reports);
  let scopedTransactions: NormalizedTransaction[] = [];
  let label = "No resolved scope";
  let source: ScopedTransactionContext["source"] = "none";

  if (matchedReport) {
    scopedTransactions = matchedReport.transactions;
    label = matchedReport.title;
    source = "report";
  }

  if (scopedTransactions.length === 0) {
    const categoryScoped = findTransactionsByScope(conversationScope, transactions);
    if (categoryScoped.length > 0) {
      scopedTransactions = categoryScoped;
      label = describeConversationScope(conversationScope);
      source = "scope";
    }
  }

  const previewTransactions = scopedTransactions.slice(0, MAX_SCOPED_TRANSACTIONS);
  const totalMatches = scopedTransactions.length;
  const totalAmount = scopedTransactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );

  return {
    label,
    transactions: previewTransactions,
    totalMatches,
    totalAmount,
    appliedFilters: buildScopeAppliedFilters(conversationScope),
    isTruncated: scopedTransactions.length > previewTransactions.length,
    source,
  };
}

function scopedContextFromClusterResult(clusterResult: TransactionClusterResult): ScopedTransactionContext {
  return {
    label: clusterResult.label,
    transactions: clusterResult.previewTransactions,
    totalMatches: clusterResult.totalMatches,
    totalAmount: clusterResult.totalAmount,
    appliedFilters: clusterResult.appliedFilters,
    isTruncated: clusterResult.isTruncated,
    source: "cluster",
  };
}

function findRelevantPolicyChunks(
  question: string,
  keywords: string[],
  policyDocument: PolicyDocument,
) {
  const weightedChunks = policyDocument.chunks.map((chunk) => ({
    chunk,
    score: keywords.reduce((score, keyword) => {
      const lowerChunk = chunk.text.toLowerCase();

      if (lowerChunk.includes(keyword)) {
        return score + 3;
      }

      return score;
    }, 0),
  }));

  return weightedChunks
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
    .slice(0, MAX_POLICY_CHUNKS)
    .map((item) => item.chunk);
}

function findRelevantReports(question: string, keywords: string[], reports: ExpenseReport[]) {
  return reports
    .map((report) => ({
      report,
      score: scoreReport(report, keywords),
    }))
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.report.endDate.localeCompare(a.report.endDate) ||
        b.report.totalAmount - a.report.totalAmount,
    )
    .slice(0, MAX_RELEVANT_REPORTS)
    .map((item) => item.report);
}

function scoreReport(report: ExpenseReport, keywords: string[]) {
  const haystack = [
    report.title,
    report.type,
    report.status,
    report.merchantSummary.join(" "),
    report.categorySummary.join(" "),
    report.rationale.join(" "),
    ...report.findings.map((finding) => `${finding.title} ${finding.detail}`),
  ]
    .join(" ")
    .toLowerCase();

  return keywords.reduce((score, keyword) => {
    if (haystack.includes(keyword)) {
      return score + 3;
    }

    return score;
  }, 0);
}

function summarizeReport(report: ExpenseReport) {
  return `- ${report.title} | ${formatReportType(report.type)} | ${capitalize(
    report.status,
  )} | ${formatCurrency(report.totalAmount)} | ${report.transactionCount} transactions | ${
    report.rationale[0] ?? "No rationale available."
  }`;
}

function summarizeReportStatuses(reports: ExpenseReport[]) {
  return reports.reduce(
    (counts, report) => {
      counts[report.status] += 1;
      return counts;
    },
    { ready: 0, review: 0, investigate: 0 },
  );
}

function summarizeReportTypes(reports: ExpenseReport[]) {
  const counts = new Map<ExpenseReport["type"], number>();

  for (const report of reports) {
    counts.set(report.type, (counts.get(report.type) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function formatFlagType(value: ComplianceFlag["flagType"]) {
  return value
    .split("_")
    .map(capitalize)
    .join(" ");
}

function formatReportType(value: ExpenseReport["type"]) {
  return value
    .split("_")
    .map(capitalize)
    .join(" ");
}

function formatClassification(value: ComplianceFlag["classification"]) {
  return capitalize(value);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isRiskQuestion(questionLower: string, keywords: string[]) {
  return hasAnyKeyword(questionLower, keywords, [
    "risk",
    "flag",
    "flags",
    "compliance",
    "duplicate",
    "split",
    "cash",
    "advance",
    "alert",
    "alerts",
    "workflow",
    "review",
    "investigate",
    "high",
    "largest",
    "biggest",
  ]);
}

function isPolicyQuestion(questionLower: string, keywords: string[]) {
  return hasAnyKeyword(questionLower, keywords, [
    "policy",
    "receipt",
    "receipts",
    "reimburse",
    "reimbursed",
    "reimbursement",
    "pre",
    "authorization",
    "approve",
    "approval",
    "alcohol",
    "tip",
    "fee",
    "fees",
    "card",
    "abuse",
    "falsifying",
  ]);
}

function isMerchantOrSpendQuestion(questionLower: string, keywords: string[]) {
  return hasAnyKeyword(questionLower, keywords, [
    "merchant",
    "merchants",
    "vendor",
    "vendors",
    "spend",
    "amount",
    "amounts",
    "largest",
    "top",
    "who",
    "where",
    "cost",
    "costs",
  ]);
}

function isOverviewQuestion(questionLower: string, keywords: string[]) {
  return hasAnyKeyword(questionLower, keywords, [
    "summary",
    "summarize",
    "overview",
    "pattern",
    "patterns",
    "trend",
    "trends",
    "happening",
    "overall",
  ]);
}

function isReportQuestion(questionLower: string, keywords: string[]) {
  return hasAnyKeyword(questionLower, keywords, [
    "report",
    "reports",
    "trip",
    "cluster",
    "clusters",
    "travel",
    "transport",
    "meal",
    "meals",
    "software",
    "subscription",
    "subscriptions",
    "entertainment",
  ]);
}

function hasAnyKeyword(questionLower: string, keywords: string[], candidates: string[]) {
  return candidates.some(
    (candidate) => questionLower.includes(candidate) || keywords.includes(candidate),
  );
}

function isScopeReferenceQuestion(questionLower: string) {
  return [
    "this category",
    "that category",
    "these transactions",
    "those transactions",
    "this report",
    "that report",
    "this spend",
    "that spend",
    "this cluster",
    "that cluster",
  ].some((term) => questionLower.includes(term));
}

function isFullListQuestion(questionLower: string) {
  return [
    "full list",
    "all rows",
    "all transactions",
    "continue the list",
    "show the full list",
    "show all",
  ].some((term) => questionLower.includes(term));
}

function isFollowUpDetailQuestion(questionLower: string) {
  return [
    "more detail",
    "more details",
    "breakdown",
    "give me the list",
    "show me the list",
    "which ones",
    "what are they",
    "these transactions",
    "that category",
    "this category",
    "this report",
    "that report",
    "this cluster",
    "that cluster",
    "full list",
    "all rows",
    "show all",
    "continue the list",
  ].some((term) => questionLower.includes(term));
}

function resolveConversationScope(messages: AssistantConversationMessage[]): ConversationScope {
  const userMessages = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean);
  const latestUserMessage = userMessages.at(-1)?.toLowerCase() ?? "";
  const latestMonthYear = extractMonthYear(latestUserMessage);
  const latestReportType = extractRequestedReportType(latestUserMessage);
  const latestAmountBounds = extractTransactionClusterAmountBounds(latestUserMessage);
  let inheritedMonthYear: string | null = null;
  let inheritedReportType: ExpenseReport["type"] | null = null;
  let inheritedClusterQuery: TransactionClusterQuery | null = null;

  for (const message of userMessages.slice(0, -1)) {
    const lowerMessage = message.toLowerCase();
    const monthYear = extractMonthYear(lowerMessage);
    const reportType = extractRequestedReportType(lowerMessage);
    const clusterQuery = buildClusterQueryForQuestion(lowerMessage, monthYear, reportType);

    if (monthYear) {
      inheritedMonthYear = monthYear;
    }

    if (reportType) {
      inheritedReportType = reportType;
    }

    if (clusterQuery) {
      inheritedClusterQuery = clusterQuery;
    }
  }

  const shouldInheritScope =
    isScopeReferenceQuestion(latestUserMessage) ||
    (isFollowUpDetailQuestion(latestUserMessage) && (!latestMonthYear || !latestReportType));
  const monthYear = latestMonthYear ?? (shouldInheritScope ? inheritedMonthYear : null);
  const reportType = latestReportType ?? (shouldInheritScope ? inheritedReportType : null);
  const latestClusterQuery = buildClusterQueryForQuestion(
    latestUserMessage,
    monthYear,
    reportType,
  );
  const clusterQuery =
    latestClusterQuery ??
    (shouldInheritScope ? mergeClusterScope(inheritedClusterQuery, monthYear, reportType) : null);

  return {
    monthYear,
    reportType,
    clusterQuery:
      latestAmountBounds ||
      clusterQuery?.amountMin !== undefined ||
      clusterQuery?.amountMax !== undefined
        ? clusterQuery
        : null,
    fullListRequested: isFullListQuestion(latestUserMessage),
  };
}

function buildClusterQueryForQuestion(
  questionLower: string,
  monthYear: string | null,
  reportType: ExpenseReport["type"] | null,
): TransactionClusterQuery | null {
  const amountBounds = extractTransactionClusterAmountBounds(questionLower);

  if (!amountBounds || !isTransactionClusterIntent(questionLower)) {
    return null;
  }

  return {
    ...amountBounds,
    ...(monthYear ? { monthYear } : {}),
    ...(reportType ? { reportType } : {}),
  };
}

function mergeClusterScope(
  clusterQuery: TransactionClusterQuery | null,
  monthYear: string | null,
  reportType: ExpenseReport["type"] | null,
): TransactionClusterQuery | null {
  if (!clusterQuery) {
    return null;
  }

  return {
    ...clusterQuery,
    ...(monthYear ? { monthYear } : {}),
    ...(reportType ? { reportType } : {}),
  };
}

function findReportForScope(scope: ConversationScope, reports: ExpenseReport[]) {
  if (!scope.monthYear && !scope.reportType) {
    return null;
  }

  const scoredReports = reports
    .map((report) => {
      let score = 0;

      if (scope.reportType && report.type === scope.reportType) {
        score += 6;
      }

      if (scope.monthYear && report.startDate.startsWith(scope.monthYear)) {
        score += 5;
      }

      if (scope.monthYear && report.endDate.startsWith(scope.monthYear)) {
        score += 3;
      }

      return { report, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.report.endDate.localeCompare(a.report.endDate));

  return scoredReports[0]?.report ?? null;
}

function findTransactionsByScope(scope: ConversationScope, transactions: NormalizedTransaction[]) {
  if (!scope.monthYear && !scope.reportType) {
    return [];
  }

  return transactions
    .filter((transaction) => {
      if (scope.monthYear && !transaction.date.startsWith(scope.monthYear)) {
        return false;
      }

      if (!scope.reportType) {
        return true;
      }

      return transactionMatchesReportType(transaction, scope.reportType);
    })
    .sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date));
}

function describeConversationScope(scope: ConversationScope) {
  const readableType = scope.reportType ? formatReportType(scope.reportType) : "Scoped workbook transactions";

  if (scope.monthYear) {
    return `${readableType} for ${formatMonthYear(scope.monthYear)}`;
  }

  return readableType;
}

function formatMonthYear(value: string) {
  const [year, month] = value.split("-");
  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ] as const;
  const monthIndex = Number(month) - 1;
  const monthName = monthNames[monthIndex] ?? value;
  return `${capitalize(monthName)} ${year}`;
}

function buildScopeAppliedFilters(scope: ConversationScope) {
  const filters: string[] = [];

  if (scope.monthYear) {
    filters.push(`Month ${formatMonthYear(scope.monthYear)}`);
  }

  if (scope.reportType) {
    filters.push(`Report type ${formatReportType(scope.reportType)}`);
  }

  return filters;
}

function isTransactionClusterIntent(questionLower: string) {
  const clusterTerms = [
    "cluster",
    "group",
    "list",
    "filter",
    "show",
    "find",
    "transactions",
    "transaction",
    "spend",
    "spending",
    "charges",
    "expenses",
    "amount",
    "amounts",
    "rows",
  ];

  return (
    clusterTerms.some((term) => questionLower.includes(term)) &&
    !questionLower.includes("policy") &&
    !questionLower.includes("receipt") &&
    !questionLower.includes("receipts") &&
    !questionLower.includes("reimbursement") &&
    !questionLower.includes("reimburse")
  );
}

function severityRank(value: ComplianceFlag["severity"]) {
  switch (value) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
      return 2;
  }
}
