import {
  DEFAULT_CLASSIFICATION_COUNTS,
  DEFAULT_SEVERITY_COUNTS,
  normalizeComplianceFlag,
  normalizeComplianceSummary,
} from "@/lib/compliance/defaults";
import { BRIM_POLICY } from "@/lib/policy/brim-policy";
import { formatCurrency } from "@/lib/transactions/format";
import type {
  ComplianceFlag,
  ComplianceClassification,
  ComplianceFlagType,
  ComplianceSummary,
  NormalizedTransaction,
} from "@/types/transactions";

type ComplianceResult = {
  summary: ComplianceSummary;
  flags: ComplianceFlag[];
};

const SPLIT_WINDOW_MIN = 35;
const NEAR_DUPLICATE_DAYS = 2;
const NEAR_DUPLICATE_AMOUNT_DELTA = 1;

export function evaluateTransactions(
  transactions: NormalizedTransaction[],
): ComplianceResult {
  const flags: ComplianceFlag[] = [];
  const seen = new Set<string>();
  const positiveTransactions = transactions.filter((transaction) => transaction.amount > 0);

  for (const transaction of positiveTransactions) {
    if (transaction.amount > BRIM_POLICY.preAuthorizationThreshold) {
      addFlag(flags, seen, {
        id: `${transaction.id}:requires_pre_authorization`,
        transactionId: transaction.id,
        date: transaction.date,
        merchant: transaction.merchant,
        amount: transaction.amount,
        flagType: "requires_pre_authorization",
        classification: getFlagClassification("requires_pre_authorization"),
        severity: transaction.amount > 500 ? "medium" : "low",
        explanation: `Amount exceeds the ${formatCurrency(
          BRIM_POLICY.preAuthorizationThreshold,
        )} pre-authorization workflow threshold.`,
        details: [
          BRIM_POLICY.preAuthorizationReference,
          BRIM_POLICY.receiptsReference,
          `Recorded amount: ${formatCurrency(transaction.amount)}.`,
        ],
      });
    }
  }

  for (const group of findPossibleSplitTransactions(positiveTransactions)) {
    for (const transaction of group.transactions) {
      addFlag(flags, seen, {
        id: `${transaction.id}:possible_split_transaction`,
        transactionId: transaction.id,
        date: transaction.date,
        merchant: transaction.merchant,
        amount: transaction.amount,
        flagType: "possible_split_transaction",
        classification: getFlagClassification("possible_split_transaction"),
        severity: "high",
        explanation: "Same-day charges cluster just below the approval threshold.",
        details: [
          `${group.transactions.length} same-day transactions total ${formatCurrency(group.total)} at ${
            transaction.merchant
          }.`,
          `Each charge stays between ${formatCurrency(SPLIT_WINDOW_MIN)} and ${formatCurrency(
            BRIM_POLICY.preAuthorizationThreshold,
          )}.`,
          "Pattern may indicate a split purchase designed to avoid pre-authorization review.",
        ],
      });
    }
  }

  for (const group of findExactDuplicates(positiveTransactions)) {
    for (const transaction of group.transactions) {
      addFlag(flags, seen, {
        id: `${transaction.id}:duplicate_transaction`,
        transactionId: transaction.id,
        date: transaction.date,
        merchant: transaction.merchant,
        amount: transaction.amount,
        flagType: "duplicate_transaction",
        classification: getFlagClassification("duplicate_transaction"),
        severity: "high",
        explanation: "Duplicate transaction pattern detected.",
        details: [
          `${group.transactions.length} transactions share the same merchant, date, and amount.`,
          `Duplicate cluster total: ${formatCurrency(group.total)}.`,
          BRIM_POLICY.abuseReference,
        ],
      });
    }
  }

  for (const pair of findNearDuplicates(positiveTransactions)) {
    for (const transaction of pair.transactions) {
      addFlag(flags, seen, {
        id: `${transaction.id}:near_duplicate_transaction:${pair.anchorId}`,
        transactionId: transaction.id,
        date: transaction.date,
        merchant: transaction.merchant,
        amount: transaction.amount,
        flagType: "near_duplicate_transaction",
        classification: getFlagClassification("near_duplicate_transaction"),
        severity: "medium",
        explanation: "Near-duplicate charge detected across a short time window.",
        details: [
          `Related transaction is within ${NEAR_DUPLICATE_DAYS} days and ${formatCurrency(
            NEAR_DUPLICATE_AMOUNT_DELTA,
          )} of this amount.`,
          `Nearby amount pair: ${formatCurrency(pair.transactions[0].amount)} and ${formatCurrency(
            pair.transactions[1].amount,
          )}.`,
        ],
      });
    }
  }

  for (const transaction of positiveTransactions) {
    const lowerDescription = transaction.description.toLowerCase();
    const lowerMerchant = transaction.merchant.toLowerCase();
    const feeLike =
      transaction.type === "fee" ||
      /\b(fee|fees|service charge|convenience fee|annual fee)\b/.test(lowerDescription);
    const cashAdvanceLike =
      /\b(cash advance|cashadv|atm withdrawal|atm fee|withdrawal)\b/.test(lowerDescription) ||
      /\b(cash advance|atm)\b/.test(lowerMerchant);

    if (feeLike || cashAdvanceLike) {
      const flagType: ComplianceFlagType = "fee_or_cash_advance";
      addFlag(flags, seen, {
        id: `${transaction.id}:${flagType}`,
        transactionId: transaction.id,
        date: transaction.date,
        merchant: transaction.merchant,
        amount: transaction.amount,
        flagType,
        classification: getFlagClassification(flagType),
        severity: cashAdvanceLike ? "high" : "medium",
        explanation: cashAdvanceLike
          ? "Cash-advance-like activity is not a normal reimbursable expense."
          : "Fee-style charge should be reviewed for policy fit and reimbursement eligibility.",
        details: [
          cashAdvanceLike
            ? "Description or merchant text matches a cash advance or withdrawal pattern."
            : "Description or normalized type matches a fee-style charge.",
          BRIM_POLICY.cardFeeReference,
        ],
      });
    }

    const needsReview =
      transaction.country === "Unknown" ||
      (transaction.category === "Unmapped" && transaction.amount > 250) ||
      /\b(adjustment|manual|misc|unknown)\b/.test(lowerDescription);

    if (needsReview) {
      addFlag(flags, seen, {
        id: `${transaction.id}:needs_review`,
        transactionId: transaction.id,
        date: transaction.date,
        merchant: transaction.merchant,
        amount: transaction.amount,
        flagType: "needs_review",
        classification: getFlagClassification("needs_review"),
        severity: "low",
        explanation: "Transaction needs manual review because the policy signal is ambiguous.",
        details: [
          transaction.country === "Unknown"
            ? "Merchant geography is missing or unclear."
            : "Expense category could not be mapped confidently from the source data.",
          "This is a deterministic fallback flag rather than a non-compliance verdict.",
        ],
      });
    }
  }

  flags.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return (
      severityOrder[a.severity] - severityOrder[b.severity] ||
      b.date.localeCompare(a.date) ||
      b.amount - a.amount
    );
  });

  return {
    summary: buildSummary(flags),
    flags,
  };
}

function addFlag(flags: ComplianceFlag[], seen: Set<string>, flag: ComplianceFlag) {
  const safeFlag = normalizeComplianceFlag(flag);

  if (seen.has(safeFlag.id)) {
    return;
  }

  seen.add(safeFlag.id);
  flags.push(safeFlag);
}

function buildSummary(flags: ComplianceFlag[]): ComplianceSummary {
  const severityCounts = { ...DEFAULT_SEVERITY_COUNTS };
  const classificationCounts = { ...DEFAULT_CLASSIFICATION_COUNTS };

  const flagTypeCounts = new Map<ComplianceFlagType, number>();
  const flaggedTransactionIds = new Set<string>();

  for (const flag of flags) {
    const classification = flag.classification ?? "info";
    severityCounts[flag.severity] += 1;
    classificationCounts[classification] += 1;
    flagTypeCounts.set(flag.flagType, (flagTypeCounts.get(flag.flagType) ?? 0) + 1);
    flaggedTransactionIds.add(flag.transactionId);
  }

  return normalizeComplianceSummary({
    totalFlags: flags.length,
    flaggedTransactionCount: flaggedTransactionIds.size,
    severityCounts,
    classificationCounts,
    flagTypeCounts: [...flagTypeCounts.entries()]
      .map(([flagType, count]) => ({ flagType, count }))
      .sort((a, b) => b.count - a.count),
  });
}

export function getFlagClassification(flagType: ComplianceFlagType): ComplianceClassification {
  switch (flagType) {
    case "possible_split_transaction":
    case "duplicate_transaction":
    case "near_duplicate_transaction":
    case "fee_or_cash_advance":
      return "risk";
    case "requires_pre_authorization":
      return "workflow";
    case "needs_review":
      return "info";
  }

  return "info";
}

function findPossibleSplitTransactions(transactions: NormalizedTransaction[]) {
  const groups = new Map<string, NormalizedTransaction[]>();

  for (const transaction of transactions) {
    if (
      transaction.amount < SPLIT_WINDOW_MIN ||
      transaction.amount <= 0 ||
      transaction.amount >= BRIM_POLICY.preAuthorizationThreshold
    ) {
      continue;
    }

    const key = `${transaction.date}:${transaction.merchant}`;
    const group = groups.get(key) ?? [];
    group.push(transaction);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      transactions: group,
      total: group.reduce((sum, transaction) => sum + transaction.amount, 0),
    }))
    .filter((group) => group.transactions.length >= 2 && group.total > BRIM_POLICY.preAuthorizationThreshold);
}

function findExactDuplicates(transactions: NormalizedTransaction[]) {
  const groups = new Map<string, NormalizedTransaction[]>();

  for (const transaction of transactions) {
    const amountKey = transaction.amount.toFixed(2);
    const key = `${transaction.date}:${transaction.merchant}:${amountKey}`;
    const group = groups.get(key) ?? [];
    group.push(transaction);
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.length >= 2)
    .map((group) => ({
      transactions: group,
      total: group.reduce((sum, transaction) => sum + transaction.amount, 0),
    }));
}

function findNearDuplicates(transactions: NormalizedTransaction[]) {
  const byMerchant = new Map<string, NormalizedTransaction[]>();
  const pairs: Array<{
    anchorId: string;
    transactions: [NormalizedTransaction, NormalizedTransaction];
  }> = [];
  const seenPairs = new Set<string>();

  for (const transaction of transactions) {
    const group = byMerchant.get(transaction.merchant) ?? [];
    group.push(transaction);
    byMerchant.set(transaction.merchant, group);
  }

  for (const merchantTransactions of byMerchant.values()) {
    const sorted = [...merchantTransactions].sort((a, b) => a.date.localeCompare(b.date));

    for (let index = 0; index < sorted.length; index += 1) {
      for (let compareIndex = index + 1; compareIndex < sorted.length; compareIndex += 1) {
        const left = sorted[index];
        const right = sorted[compareIndex];
        const dayDifference = Math.abs(daysBetween(left.date, right.date));

        if (dayDifference > NEAR_DUPLICATE_DAYS) {
          break;
        }

        const amountDelta = Math.abs(left.amount - right.amount);
        const exactDuplicate =
          left.date === right.date && left.amount.toFixed(2) === right.amount.toFixed(2);

        if (exactDuplicate || amountDelta > NEAR_DUPLICATE_AMOUNT_DELTA) {
          continue;
        }

        const pairKey = [left.id, right.id].sort().join(":");
        if (seenPairs.has(pairKey)) {
          continue;
        }

        seenPairs.add(pairKey);
        pairs.push({
          anchorId: left.id,
          transactions: [left, right],
        });
      }
    }
  }

  return pairs;
}

function daysBetween(leftDate: string, rightDate: string) {
  const left = new Date(`${leftDate}T00:00:00Z`).getTime();
  const right = new Date(`${rightDate}T00:00:00Z`).getTime();
  return Math.round((right - left) / (24 * 60 * 60 * 1000));
}
