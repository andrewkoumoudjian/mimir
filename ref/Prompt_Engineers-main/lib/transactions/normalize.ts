import { formatCurrency, formatPercent } from "@/lib/transactions/format";
import type {
  CountryBreakdown,
  DashboardInsight,
  MerchantSummary,
  NormalizedTransaction,
  TransactionType,
} from "@/types/transactions";

export function normalizeTransaction(raw: Record<string, string>, index: number): NormalizedTransaction {
  const description = raw["Transaction Description"]?.trim() || "No description";
  const merchant = normalizeMerchant(raw["Merchant Info DBA Name"] || description);
  const signedAmount = normalizeAmount(raw["Transaction Amount"], raw["Debit or Credit"]);
  const merchantCategoryCode = raw["Merchant Category Code"]?.trim();
  const type = deriveTransactionType(description, signedAmount);
  const date = normalizeDate(raw["Transaction Date"]);

  return {
    id: `${date}-${merchant.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index + 1}`,
    date,
    amount: signedAmount,
    merchant,
    description,
    category: deriveCategory(description, merchantCategoryCode),
    country: normalizeCountry(raw["Merchant Country"]?.trim()),
    currency: "CAD",
    type,
    raw,
  };
}

export function buildTopMerchants(
  transactions: NormalizedTransaction[],
  totalSpend: number,
): MerchantSummary[] {
  const merchantMap = new Map<string, number>();

  for (const transaction of transactions.filter((item) => item.amount > 0)) {
    merchantMap.set(transaction.merchant, (merchantMap.get(transaction.merchant) ?? 0) + transaction.amount);
  }

  return [...merchantMap.entries()]
    .map(([merchant, amount]) => ({
      merchant,
      totalSpend: amount,
      shareOfSpend: totalSpend > 0 ? amount / totalSpend : 0,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 5);
}

export function buildCountryBreakdown(
  transactions: NormalizedTransaction[],
  totalSpend: number,
): CountryBreakdown[] {
  const countryMap = new Map<string, number>();

  for (const transaction of transactions.filter((item) => item.amount > 0 && item.country)) {
    const country = transaction.country ?? "Unknown";
    countryMap.set(country, (countryMap.get(country) ?? 0) + transaction.amount);
  }

  return [...countryMap.entries()]
    .map(([country, amount]) => ({
      country,
      totalSpend: amount,
      shareOfSpend: totalSpend > 0 ? amount / totalSpend : 0,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

export function buildInsights(
  transactions: NormalizedTransaction[],
  totalSpend: number,
): DashboardInsight[] {
  const insights: DashboardInsight[] = [];
  const spendTransactions = transactions.filter((transaction) => transaction.amount > 0);
  const averageSpend =
    spendTransactions.reduce((sum, transaction) => sum + transaction.amount, 0) /
    Math.max(spendTransactions.length, 1);

  const largeTransactions = spendTransactions
    .filter((transaction) => transaction.amount >= Math.max(averageSpend * 2.5, 1500))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  if (largeTransactions.length > 0) {
    insights.push({
      id: "large-transactions",
      label: "Large spend",
      title: `${largeTransactions.length} unusually large transactions need a quick review`,
      detail: `Largest item is ${formatCurrency(largeTransactions[0].amount)} at ${
        largeTransactions[0].merchant
      }, above the slice threshold of ${formatCurrency(Math.max(averageSpend * 2.5, 1500))}.`,
    });
  }

  const repeatedMerchantGroups = groupByDateAndMerchant(spendTransactions).filter((group) => group.count >= 2);

  if (repeatedMerchantGroups.length > 0) {
    const repeat = repeatedMerchantGroups.sort((a, b) => b.total - a.total)[0];
    insights.push({
      id: "same-day-repeat",
      label: "Repeat charge",
      title: `${repeat.count} same-day charges hit ${repeat.merchant}`,
      detail: `${repeat.date} shows ${repeat.count} charges totaling ${formatCurrency(
        repeat.total,
      )}, which is worth checking for duplicate or split billing.`,
    });
  }

  const topMerchant = buildTopMerchants(transactions, totalSpend)[0];

  if (topMerchant && topMerchant.shareOfSpend >= 0.2) {
    insights.push({
      id: "merchant-concentration",
      label: "Concentration",
      title: `${topMerchant.merchant} accounts for ${formatPercent(topMerchant.shareOfSpend)} of spend`,
      detail: "Spend concentration is high enough to merit a quick vendor-level review for recurring or bundled charges.",
    });
  }

  const refundsAndFees = transactions.filter(
    (transaction) => transaction.type === "credit" || transaction.type === "fee",
  );

  if (refundsAndFees.length > 0) {
    const totalCredits = refundsAndFees
      .filter((transaction) => transaction.type === "credit")
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    const totalFees = refundsAndFees
      .filter((transaction) => transaction.type === "fee")
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    insights.push({
      id: "credits-and-fees",
      label: "Credits and fees",
      title: `${refundsAndFees.length} credits or fees were detected in the ledger`,
      detail: `Credits total ${formatCurrency(totalCredits)} and fees total ${formatCurrency(
        totalFees,
      )}, so the dataset includes both recoveries and card-cost friction.`,
    });
  }

  const countryBreakdown = buildCountryBreakdown(transactions, totalSpend);
  const domesticCountry = countryBreakdown[0];
  const nonDomesticSpend = countryBreakdown
    .slice(1)
    .reduce((sum, country) => sum + country.totalSpend, 0);

  if (domesticCountry && countryBreakdown.length > 1) {
    insights.push({
      id: "geography-pattern",
      label: "Geography",
      title: `${countryBreakdown.length} countries appear in the current spend mix`,
      detail: `${domesticCountry.country} leads with ${formatPercent(
        domesticCountry.shareOfSpend,
      )} of spend, while non-leading countries contribute ${formatCurrency(nonDomesticSpend)} combined.`,
    });
  }

  return insights.slice(0, 5);
}

function groupByDateAndMerchant(transactions: NormalizedTransaction[]) {
  const groups = new Map<string, { date: string; merchant: string; count: number; total: number }>();

  for (const transaction of transactions) {
    const key = `${transaction.date}:${transaction.merchant}`;
    const existing = groups.get(key);

    if (existing) {
      existing.count += 1;
      existing.total += transaction.amount;
      continue;
    }

    groups.set(key, {
      date: transaction.date,
      merchant: transaction.merchant,
      count: 1,
      total: transaction.amount,
    });
  }

  return [...groups.values()];
}

function normalizeMerchant(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeDate(value?: string) {
  if (!value) {
    return "1970-01-01";
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 1000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + numericValue * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "1970-01-01";
  }

  return date.toISOString().slice(0, 10);
}

function deriveTransactionType(description: string, amount: number): TransactionType {
  const normalized = description.toLowerCase();
  const hasFeeKeyword = /\bfees?\b/.test(normalized);

  if (amount < 0 || normalized.includes("refund") || normalized.includes("credit")) {
    return "credit";
  }

  if (hasFeeKeyword) {
    return "fee";
  }

  if (normalized.includes("payment")) {
    return "payment";
  }

  return "purchase";
}

function deriveCategory(description: string, merchantCategoryCode?: string) {
  const normalized = description.toLowerCase();
  const mccCategory = merchantCategoryCode ? merchantCategoryMap[merchantCategoryCode] : undefined;
  const hasFeeKeyword = /\bfees?\b/.test(normalized);

  if (mccCategory) {
    return mccCategory;
  }

  if (
    normalized.includes("hotel") ||
    normalized.includes("taxi") ||
    normalized.includes("rail") ||
    normalized.includes("permit")
  ) {
    return "Travel";
  }

  if (hasFeeKeyword) {
    return "Fees";
  }

  if (normalized.includes("fedex")) {
    return "Shipping";
  }

  return "Unmapped";
}

function normalizeCountry(value?: string) {
  if (!value) {
    return "Unknown";
  }

  return countryCodeMap[value] ?? value;
}

function normalizeAmount(amountValue?: string, debitOrCredit?: string) {
  const parsed = Number.parseFloat(amountValue ?? "0");
  const amount = Number.isFinite(parsed) ? parsed : 0;
  return debitOrCredit?.trim().toLowerCase() === "credit" ? -Math.abs(amount) : amount;
}

const countryCodeMap: Record<string, string> = {
  CAN: "Canada",
  USA: "United States",
  GBR: "United Kingdom",
  NLD: "Netherlands",
};

const merchantCategoryMap: Record<string, string> = {
  "4121": "Taxi and Ride Services",
  "4215": "Shipping and Courier",
  "4784": "Road and Toll Charges",
  "4816": "Telecom Services",
  "5046": "Commercial Equipment",
  "5300": "Wholesale Club",
  "5411": "Groceries",
  "5533": "Automotive Parts",
  "5541": "Fuel",
  "5542": "Automated Fuel",
  "5561": "Trailer and Vehicle",
  "7011": "Lodging",
  "7538": "Vehicle Service",
  "7542": "Wash and Maintenance",
  "9399": "Government Services",
};
