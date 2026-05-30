import type {
  ComplianceClassification,
  ComplianceSeverity,
  ComplianceFlagType,
  NormalizedTransaction,
} from "@/types/transactions";

export type ExpenseReportStatus = "ready" | "review" | "investigate";

export type ExpenseReportType =
  | "trip"
  | "client_entertainment"
  | "meals"
  | "local_transport"
  | "software"
  | "general";

export type ReportFinding = {
  code: string;
  title: string;
  group: ComplianceClassification;
  severity: ComplianceSeverity;
  detail: string;
  transactionIds: string[];
  source: "compliance" | "grouping";
};

export type ExpenseReport = {
  id: string;
  type: ExpenseReportType;
  title: string;
  status: ExpenseReportStatus;
  transactionIds: string[];
  transactions: NormalizedTransaction[];
  totalAmount: number;
  transactionCount: number;
  startDate: string;
  endDate: string;
  merchantSummary: string[];
  categorySummary: string[];
  rationale: string[];
  findings: ReportFinding[];
  relatedFlagTypes: ComplianceFlagType[];
};
