export type TransactionType = "purchase" | "credit" | "fee" | "payment";

export type RawTransactionRecord = Record<string, string>;

export type NormalizedTransaction = {
  id: string;
  date: string;
  amount: number;
  merchant: string;
  description: string;
  category?: string;
  country?: string;
  currency: string;
  type: TransactionType;
  raw: RawTransactionRecord;
};

export type MerchantSummary = {
  merchant: string;
  totalSpend: number;
  shareOfSpend: number;
};

export type CountryBreakdown = {
  country: string;
  totalSpend: number;
  shareOfSpend: number;
};

export type DashboardInsight = {
  id: string;
  label: string;
  title: string;
  detail: string;
};

export type ComplianceSeverity = "low" | "medium" | "high";
export type ComplianceClassification = "risk" | "workflow" | "info";

export type ComplianceFlagType =
  | "requires_pre_authorization"
  | "possible_split_transaction"
  | "duplicate_transaction"
  | "near_duplicate_transaction"
  | "fee_or_cash_advance"
  | "needs_review";

export type ComplianceFlag = {
  id: string;
  transactionId: string;
  date: string;
  merchant: string;
  amount: number;
  flagType: ComplianceFlagType;
  classification: ComplianceClassification;
  severity: ComplianceSeverity;
  explanation: string;
  details: string[];
};

export type ComplianceSummary = {
  totalFlags: number;
  flaggedTransactionCount: number;
  severityCounts: Record<ComplianceSeverity, number>;
  classificationCounts: Record<ComplianceClassification, number>;
  flagTypeCounts: Array<{
    flagType: ComplianceFlagType;
    count: number;
  }>;
};

export type DashboardData = {
  source: {
    datasetName: string;
    recordCount: number;
  };
  summary: {
    transactionCount: number;
    totalSpend: number;
    startDate: string;
    endDate: string;
    countryCount: number;
    topMerchants: MerchantSummary[];
    countryBreakdown: CountryBreakdown[];
  };
  insights: DashboardInsight[];
  compliance: {
    summary: ComplianceSummary;
    flags: ComplianceFlag[];
  };
  transactions: NormalizedTransaction[];
};
