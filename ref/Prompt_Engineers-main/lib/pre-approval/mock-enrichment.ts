import { DEFAULT_CLASSIFICATION_COUNTS, DEFAULT_SEVERITY_COUNTS } from "@/lib/compliance/defaults";
import { formatCurrency } from "@/lib/transactions/format";
import type { NormalizedTransaction } from "@/types/transactions";
import type {
  ExpenseRequest,
  ExpenseRequestInput,
  ExpenseType,
  PaymentMethod,
  PreApprovalCheckSummary,
  RecommendationState,
  ReviewerContext,
  TransportType,
} from "@/types/pre-approval";

type EmployeeRecord = {
  id: string;
  name: string;
  departmentId: string;
  defaultApproverId: string;
  demoPatternNote: string;
};

type DepartmentRecord = {
  id: string;
  name: string;
  budgetRemaining: number;
};

type ApproverRecord = {
  id: string;
  name: string;
};

export const DEMO_DEPARTMENTS: DepartmentRecord[] = [
  { id: "sales", name: "Sales", budgetRemaining: 18450 },
  { id: "operations", name: "Operations", budgetRemaining: 12100 },
  { id: "finance", name: "Finance", budgetRemaining: 9450 },
];

export const DEMO_APPROVERS: ApproverRecord[] = [
  { id: "ap-jordan-price", name: "Jordan Price" },
  { id: "ap-samira-khan", name: "Samira Khan" },
  { id: "ap-ethan-brooks", name: "Ethan Brooks" },
];

export const DEMO_EMPLOYEES: EmployeeRecord[] = [
  {
    id: "emp-maya-chen",
    name: "Maya Chen",
    departmentId: "sales",
    defaultApproverId: "ap-jordan-price",
    demoPatternNote: "Demo employee profile suggests frequent client-facing travel and meal requests.",
  },
  {
    id: "emp-liam-patel",
    name: "Liam Patel",
    departmentId: "operations",
    defaultApproverId: "ap-samira-khan",
    demoPatternNote: "Demo employee profile suggests recurring transportation and on-site logistics spend.",
  },
  {
    id: "emp-zoe-martin",
    name: "Zoe Martin",
    departmentId: "finance",
    defaultApproverId: "ap-ethan-brooks",
    demoPatternNote: "Demo employee profile suggests lighter travel spend and tighter budget scrutiny.",
  },
];

const SIMILAR_SPEND_KEYWORDS: Record<ExpenseType, string[]> = {
  meal: ["restaurant", "meal", "food", "dining", "cafe"],
  client_entertainment: ["restaurant", "hotel", "dining", "event", "entertainment"],
  taxi: ["taxi", "uber", "lyft", "ride"],
  parking: ["parking", "park"],
  toll: ["toll", "road"],
  car_rental: ["rental", "car", "vehicle", "hertz", "avis"],
  lodging: ["hotel", "lodging", "inn", "marriott"],
  software: ["software", "subscription", "service"],
  credit_card_fee: ["fee", "annual fee", "credit card"],
  ticket: ["ticket", "fine", "violation", "penalty"],
  other: [],
};

export const DEFAULT_PRE_APPROVAL_FORM: ExpenseRequestInput = {
  employeeId: DEMO_EMPLOYEES[0].id,
  departmentId: DEMO_EMPLOYEES[0].departmentId,
  approverId: DEMO_EMPLOYEES[0].defaultApproverId,
  expenseType: "meal",
  businessPurpose: "Client dinner after quarterly renewal planning meeting.",
  merchantName: "",
  amount: 86,
  currency: "CAD",
  requestDate: new Date().toISOString().slice(0, 10),
  eventDate: "",
  locationCity: "Toronto",
  locationCountry: "Canada",
  paymentMethod: "corporate_card",
  travelRelated: false,
  customerEntertainment: true,
  guestNames: "Jordan Lee, Priya Raman",
  alcoholIncluded: false,
  alcoholContext: "",
  transportType: undefined,
  travelerCount: 1,
  tipAmount: 14,
  tipContext: "meal",
  notes: "",
};

export function buildExpenseRequest(input: ExpenseRequestInput): ExpenseRequest {
  const employee = DEMO_EMPLOYEES.find((item) => item.id === input.employeeId) ?? DEMO_EMPLOYEES[0];
  const department =
    DEMO_DEPARTMENTS.find((item) => item.id === input.departmentId) ??
    DEMO_DEPARTMENTS.find((item) => item.id === employee.departmentId) ??
    DEMO_DEPARTMENTS[0];
  const approver =
    DEMO_APPROVERS.find((item) => item.id === input.approverId) ??
    DEMO_APPROVERS.find((item) => item.id === employee.defaultApproverId) ??
    DEMO_APPROVERS[0];

  return {
    ...input,
    id: `req-${Date.now().toString(36)}`,
    employeeName: employee.name,
    departmentName: department.name,
    approverName: approver.name,
    businessPurpose: input.businessPurpose.trim(),
    merchantName: normalizeOptionalText(input.merchantName),
    eventDate: normalizeOptionalText(input.eventDate),
    locationCity: normalizeOptionalText(input.locationCity),
    locationCountry: normalizeOptionalText(input.locationCountry),
    guestNames: normalizeOptionalText(input.guestNames),
    alcoholContext: normalizeOptionalText(input.alcoholContext),
    notes: normalizeOptionalText(input.notes),
    amount: normalizeNumber(input.amount),
    travelerCount: normalizeWholeNumber(input.travelerCount),
    tipAmount: normalizeNumber(input.tipAmount),
    transportType: input.transportType,
    tipContext: input.tipContext,
  };
}

export function buildReviewerContext(
  request: ExpenseRequest,
  transactions: NormalizedTransaction[],
): ReviewerContext {
  const department =
    DEMO_DEPARTMENTS.find((item) => item.id === request.departmentId) ?? DEMO_DEPARTMENTS[0];
  const employee =
    DEMO_EMPLOYEES.find((item) => item.id === request.employeeId) ?? DEMO_EMPLOYEES[0];

  const keywords = SIMILAR_SPEND_KEYWORDS[request.expenseType];
  const matchingTransactions = transactions.filter((transaction) => {
    if (keywords.length === 0) {
      return false;
    }

    const haystack = `${transaction.merchant} ${transaction.description} ${transaction.category ?? ""}`.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });

  const recentSimilar = matchingTransactions
    .filter((transaction) => transaction.amount > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const similarTotal = recentSimilar.reduce((sum, transaction) => sum + transaction.amount, 0);
  const recentSimilarSpendSummary =
    recentSimilar.length > 0
      ? `${recentSimilar.length} similar historical transactions appear in the workbook, totaling ${formatCurrency(
          similarTotal,
        )}. Most recent match: ${recentSimilar[0].merchant} on ${recentSimilar[0].date}.`
      : "The workbook does not expose an exact employee-level history for this request type, so direct matches are limited.";

  return {
    budgetRemaining: department.budgetRemaining,
    recentSimilarSpendSummary,
    priorRequestPatternSummary: employee.demoPatternNote,
    dataSourceNotes: [
      "Department budget remaining is explicit demo enrichment, not sourced from the workbook.",
      "Historical similar spend summaries are derived from the real workbook using simple keyword matching.",
      "Employee, department, and approver records are mock directory data because the workbook has no HR master data.",
    ],
  };
}

export function buildEmptyPreApprovalSummary(): PreApprovalCheckSummary {
  return {
    totalChecks: 0,
    severityCounts: { ...DEFAULT_SEVERITY_COUNTS },
    classificationCounts: { ...DEFAULT_CLASSIFICATION_COUNTS },
  };
}

export function formatExpenseTypeLabel(value: ExpenseType) {
  return value
    .split("_")
    .map(capitalize)
    .join(" ");
}

export function formatPaymentMethodLabel(value: PaymentMethod) {
  return value
    .split("_")
    .map(capitalize)
    .join(" ");
}

export function formatTransportTypeLabel(value: TransportType) {
  return value
    .split("_")
    .map(capitalize)
    .join(" ");
}

export function formatRecommendationLabel(value: RecommendationState) {
  return capitalize(value);
}

function normalizeOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeNumber(value?: number) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : 0;
}

function normalizeWholeNumber(value?: number) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) && nextValue > 0 ? Math.round(nextValue) : undefined;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
