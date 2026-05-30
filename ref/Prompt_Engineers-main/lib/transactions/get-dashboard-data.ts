import { evaluateTransactions } from "@/lib/compliance/evaluate-transactions";
import path from "node:path";
import { loadWorkbookRows } from "@/lib/transactions/load-workbook";
import {
  buildCountryBreakdown,
  buildInsights,
  buildTopMerchants,
  normalizeTransaction,
} from "@/lib/transactions/normalize";
import type { DashboardData } from "@/types/transactions";

const sampleDatasetPath = path.join(
  process.cwd(),
  "data",
  "transactions",
  "real-transaction-sample.xlsx",
);

export async function getDashboardData(): Promise<DashboardData> {
  const parsedRows = loadWorkbookRows(sampleDatasetPath);
  const transactions = parsedRows
    .map(normalizeTransaction)
    .sort((a, b) => b.date.localeCompare(a.date));

  const spendingTransactions = transactions.filter((transaction) => transaction.amount > 0);
  const totalSpend = spendingTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const orderedDates = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const compliance = evaluateTransactions(transactions);

  return {
    source: {
      datasetName: "Provided transaction sample (.xlsx)",
      recordCount: transactions.length,
    },
    summary: {
      transactionCount: transactions.length,
      totalSpend,
      startDate: orderedDates[0]?.date ?? "",
      endDate: orderedDates.at(-1)?.date ?? "",
      countryCount: new Set(
        transactions.map((transaction) => transaction.country).filter(Boolean),
      ).size,
      topMerchants: buildTopMerchants(transactions, totalSpend),
      countryBreakdown: buildCountryBreakdown(transactions, totalSpend),
    },
    insights: buildInsights(transactions, totalSpend),
    compliance,
    transactions,
  };
}
