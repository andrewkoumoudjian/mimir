import { formatCurrency } from "@/lib/transactions/format";
import type { ExpenseReportType } from "@/types/expense-report";
import type { TransactionClusterQuery, TransactionClusterResult } from "@/types/transaction-cluster";
import type { NormalizedTransaction } from "@/types/transactions";

const MONTH_NAMES = [
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

export const REPORT_TYPE_KEYWORDS: Record<ExpenseReportType, string[]> = {
  trip: ["trip", "travel", "flight", "hotel", "lodging"],
  client_entertainment: ["client entertainment", "entertainment", "client meal"],
  meals: ["meal", "meals", "restaurant", "food", "dining"],
  local_transport: ["transport", "uber", "lyft", "taxi", "parking", "toll", "fuel"],
  software: ["software", "subscription", "subscriptions", "saas", "license", "licenses"],
  general: ["general", "business spend"],
};

type AmountBounds = {
  amountMin?: number;
  amountMax?: number;
};

export function buildTransactionClusterResult(
  transactions: NormalizedTransaction[],
  query: TransactionClusterQuery,
  previewLimit: number,
): TransactionClusterResult {
  const matchedTransactions = transactions
    .filter((transaction) => transactionMatchesClusterQuery(transaction, query))
    .sort(compareTransactionsForCluster);
  const totalAmount = matchedTransactions.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const previewTransactions = matchedTransactions.slice(0, previewLimit);

  return {
    label: buildClusterLabel(query),
    transactions: matchedTransactions,
    previewTransactions,
    totalMatches: matchedTransactions.length,
    totalAmount,
    appliedFilters: buildAppliedFilters(query),
    isTruncated: matchedTransactions.length > previewTransactions.length,
  };
}

export function extractTransactionClusterAmountBounds(questionLower: string): AmountBounds | null {
  const betweenMatch = questionLower.match(
    /\b(?:between|from)\s+\$?\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:and|to|-)\s*\$?\s*([0-9]+(?:[.,][0-9]{1,2})?)/,
  );

  if (betweenMatch) {
    const firstAmount = parseAmountValue(betweenMatch[1]);
    const secondAmount = parseAmountValue(betweenMatch[2]);

    if (firstAmount !== null && secondAmount !== null) {
      return {
        amountMin: Math.min(firstAmount, secondAmount),
        amountMax: Math.max(firstAmount, secondAmount),
      };
    }
  }

  const simpleRangeMatch = questionLower.match(
    /\b(?:amount|amounts|spend|spending|transactions?|charges?|expenses?|cluster|group|list|filter)[^0-9]{0,40}\$?\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:to|-)\s*\$?\s*([0-9]+(?:[.,][0-9]{1,2})?)/,
  );

  if (simpleRangeMatch) {
    const firstAmount = parseAmountValue(simpleRangeMatch[1]);
    const secondAmount = parseAmountValue(simpleRangeMatch[2]);

    if (firstAmount !== null && secondAmount !== null) {
      return {
        amountMin: Math.min(firstAmount, secondAmount),
        amountMax: Math.max(firstAmount, secondAmount),
      };
    }
  }

  const aboveMatch = questionLower.match(
    /\b(above|over|greater than|more than)\s+\$?\s*([0-9]+(?:[.,][0-9]{1,2})?)/,
  );

  if (aboveMatch) {
    const amount = parseAmountValue(aboveMatch[2]);

    if (amount !== null) {
      return { amountMin: amount };
    }
  }

  const belowMatch = questionLower.match(
    /\b(under|below|less than)\s+\$?\s*([0-9]+(?:[.,][0-9]{1,2})?)/,
  );

  if (belowMatch) {
    const amount = parseAmountValue(belowMatch[2]);

    if (amount !== null) {
      return { amountMax: amount };
    }
  }

  return null;
}

export function extractMonthYear(questionLower: string) {
  for (const [index, month] of MONTH_NAMES.entries()) {
    if (!questionLower.includes(month)) {
      continue;
    }

    const yearMatch = questionLower.match(/\b(20\d{2})\b/);
    const fallbackYear = inferYearForMonth(month, yearMatch?.[1]);
    if (!fallbackYear) {
      continue;
    }

    return `${fallbackYear}-${String(index + 1).padStart(2, "0")}`;
  }

  return null;
}

export function extractRequestedReportType(questionLower: string): ExpenseReportType | null {
  for (const [type, terms] of Object.entries(REPORT_TYPE_KEYWORDS) as Array<
    [ExpenseReportType, string[]]
  >) {
    if (terms.some((term) => questionLower.includes(term))) {
      return type;
    }
  }

  return null;
}

export function transactionMatchesReportType(
  transaction: NormalizedTransaction,
  reportType: ExpenseReportType,
) {
  const haystack = `${transaction.merchant} ${transaction.description} ${transaction.category ?? ""}`.toLowerCase();
  return REPORT_TYPE_KEYWORDS[reportType].some((term) => haystack.includes(term));
}

function buildClusterLabel(query: TransactionClusterQuery) {
  const parts: string[] = [];

  if (query.reportType) {
    parts.push(`${formatReportType(query.reportType)} transactions`);
  } else {
    parts.push("Workbook transactions");
  }

  if (query.amountMin !== undefined && query.amountMax !== undefined) {
    parts.push(`between ${formatCurrency(query.amountMin)} and ${formatCurrency(query.amountMax)}`);
  } else if (query.amountMin !== undefined) {
    parts.push(`above ${formatCurrency(query.amountMin)}`);
  } else if (query.amountMax !== undefined) {
    parts.push(`below ${formatCurrency(query.amountMax)}`);
  }

  if (query.monthYear) {
    parts.push(`in ${formatMonthYear(query.monthYear)}`);
  }

  if (query.country) {
    parts.push(`for ${query.country}`);
  }

  return parts.join(" ");
}

function buildAppliedFilters(query: TransactionClusterQuery) {
  const filters: string[] = [];

  if (query.amountMin !== undefined && query.amountMax !== undefined) {
    filters.push(`Amount between ${formatCurrency(query.amountMin)} and ${formatCurrency(query.amountMax)}`);
  } else if (query.amountMin !== undefined) {
    filters.push(`Amount above ${formatCurrency(query.amountMin)}`);
  } else if (query.amountMax !== undefined) {
    filters.push(`Amount below ${formatCurrency(query.amountMax)}`);
  }

  if (query.monthYear) {
    filters.push(`Month ${formatMonthYear(query.monthYear)}`);
  }

  if (query.reportType) {
    filters.push(`Report type ${formatReportType(query.reportType)}`);
  }

  if (query.merchantKeyword) {
    filters.push(`Merchant contains "${query.merchantKeyword}"`);
  }

  if (query.categoryKeyword) {
    filters.push(`Category contains "${query.categoryKeyword}"`);
  }

  if (query.country) {
    filters.push(`Country ${query.country}`);
  }

  return filters;
}

function transactionMatchesClusterQuery(
  transaction: NormalizedTransaction,
  query: TransactionClusterQuery,
) {
  const amountBasis = Math.abs(transaction.amount);

  if (query.amountMin !== undefined && amountBasis < query.amountMin) {
    return false;
  }

  if (query.amountMax !== undefined && amountBasis > query.amountMax) {
    return false;
  }

  if (query.monthYear && !transaction.date.startsWith(query.monthYear)) {
    return false;
  }

  if (query.reportType && !transactionMatchesReportType(transaction, query.reportType)) {
    return false;
  }

  if (
    query.merchantKeyword &&
    !transaction.merchant.toLowerCase().includes(query.merchantKeyword.toLowerCase())
  ) {
    return false;
  }

  if (
    query.categoryKeyword &&
    !(transaction.category ?? "").toLowerCase().includes(query.categoryKeyword.toLowerCase())
  ) {
    return false;
  }

  if (query.country && (transaction.country ?? "").toLowerCase() !== query.country.toLowerCase()) {
    return false;
  }

  return true;
}

function compareTransactionsForCluster(left: NormalizedTransaction, right: NormalizedTransaction) {
  return (
    left.date.localeCompare(right.date) ||
    left.merchant.localeCompare(right.merchant) ||
    left.amount - right.amount ||
    left.id.localeCompare(right.id)
  );
}

function parseAmountValue(value: string) {
  const parsed = Number.parseFloat(value.replace(/,/g, ""));

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function inferYearForMonth(month: string, explicitYear?: string) {
  if (explicitYear) {
    return explicitYear;
  }

  const monthIndex = MONTH_NAMES.indexOf(month as (typeof MONTH_NAMES)[number]);
  if (monthIndex < 0) {
    return null;
  }

  return monthIndex >= 7 ? "2025" : "2026";
}

function formatMonthYear(value: string) {
  const [year, month] = value.split("-");
  const monthIndex = Number(month) - 1;
  const monthName = MONTH_NAMES[monthIndex] ?? value;
  return `${capitalize(monthName)} ${year}`;
}

function formatReportType(value: ExpenseReportType) {
  return value
    .split("_")
    .map(capitalize)
    .join(" ");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
