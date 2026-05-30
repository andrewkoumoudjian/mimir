import type { ExpenseReportType } from "@/types/expense-report";
import type { NormalizedTransaction } from "@/types/transactions";

export type TransactionClusterQuery = {
  amountMin?: number;
  amountMax?: number;
  monthYear?: string;
  reportType?: ExpenseReportType;
  merchantKeyword?: string;
  categoryKeyword?: string;
  country?: string;
};

export type TransactionClusterResult = {
  label: string;
  transactions: NormalizedTransaction[];
  previewTransactions: NormalizedTransaction[];
  totalMatches: number;
  totalAmount: number;
  appliedFilters: string[];
  isTruncated: boolean;
};
