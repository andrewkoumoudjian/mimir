import type {
  ComplianceClassification,
  ComplianceSeverity,
} from "@/types/transactions";

export type RecommendationState = "approve" | "deny" | "review" | "investigate";
export type ReviewerDecisionState = RecommendationState;
export type CheckGroup = ComplianceClassification;
export type CheckStatus = "pass" | "flag" | "needs_info";
export type RequestWorkflowStatus =
  | "new"
  | "review"
  | "investigate"
  | "approved"
  | "denied";

export type ExpenseType =
  | "meal"
  | "client_entertainment"
  | "taxi"
  | "parking"
  | "toll"
  | "car_rental"
  | "lodging"
  | "software"
  | "credit_card_fee"
  | "ticket"
  | "other";

export type PaymentMethod = "corporate_card" | "personal_card" | "reimbursement";

export type TransportType =
  | "air"
  | "rail"
  | "car_rental"
  | "personal_vehicle"
  | "taxi"
  | "parking"
  | "other";

export type TipContext = "meal" | "service";

export type ExpenseRequestInput = {
  employeeId: string;
  departmentId: string;
  approverId: string;
  expenseType: ExpenseType;
  businessPurpose: string;
  merchantName?: string;
  amount: number;
  currency: string;
  requestDate: string;
  eventDate?: string;
  locationCity?: string;
  locationCountry?: string;
  paymentMethod: PaymentMethod;
  travelRelated: boolean;
  customerEntertainment: boolean;
  guestNames?: string;
  alcoholIncluded: boolean;
  alcoholContext?: string;
  transportType?: TransportType;
  travelerCount?: number;
  tipAmount?: number;
  tipContext?: TipContext;
  notes?: string;
};

export type ExpenseRequest = ExpenseRequestInput & {
  id: string;
  employeeName: string;
  departmentName: string;
  approverName: string;
};

export type PolicyCheck = {
  code: string;
  title: string;
  group: CheckGroup;
  severity: ComplianceSeverity;
  status: CheckStatus;
  detail: string;
};

export type ReviewerContext = {
  budgetRemaining?: number;
  recentSimilarSpendSummary?: string;
  priorRequestPatternSummary?: string;
  dataSourceNotes: string[];
};

export type PreApprovalCheckSummary = {
  totalChecks: number;
  severityCounts: Record<ComplianceSeverity, number>;
  classificationCounts: Record<CheckGroup, number>;
};

export type PreApprovalEvaluation = {
  request: ExpenseRequest;
  checks: PolicyCheck[];
  summary: PreApprovalCheckSummary;
  recommendation: RecommendationState;
  rationale: string[];
  reviewerContext: ReviewerContext;
  requiredActions: string[];
};

export type ReviewerDecision = {
  decision: ReviewerDecisionState;
  reviewerNote?: string;
  decidedAt: string;
  requestId: string;
};

export type StoredExpenseRequest = {
  id: string;
  submittedAt: string;
  updatedAt: string;
  evaluation: PreApprovalEvaluation;
  systemRecommendation: RecommendationState;
  managerDecision?: ReviewerDecision;
  status: RequestWorkflowStatus;
};
