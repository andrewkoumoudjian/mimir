import type {
  PreApprovalEvaluation,
  RequestWorkflowStatus,
  ReviewerDecision,
  ReviewerDecisionState,
  StoredExpenseRequest,
} from "@/types/pre-approval";

export type AppRole = "employee" | "manager";

const REQUEST_STORE_KEY = "brim-expense-intelligence:requests";
const ROLE_STORE_KEY = "brim-expense-intelligence:role";

export function loadStoredRequests(): StoredExpenseRequest[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(REQUEST_STORE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as StoredExpenseRequest[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export function saveStoredRequests(requests: StoredExpenseRequest[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(REQUEST_STORE_KEY, JSON.stringify(requests));
}

export function loadStoredRole(): AppRole {
  if (typeof window === "undefined") {
    return "manager";
  }

  const raw = window.localStorage.getItem(ROLE_STORE_KEY);
  return raw === "employee" ? "employee" : "manager";
}

export function saveStoredRole(role: AppRole) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ROLE_STORE_KEY, role);
}

export function createStoredExpenseRequest(
  evaluation: PreApprovalEvaluation,
): StoredExpenseRequest {
  const now = new Date().toISOString();

  return {
    id: evaluation.request.id,
    submittedAt: now,
    updatedAt: now,
    evaluation,
    systemRecommendation: evaluation.recommendation,
    status: "new",
  };
}

export function upsertStoredExpenseRequest(
  requests: StoredExpenseRequest[],
  nextRequest: StoredExpenseRequest,
) {
  const filtered = requests.filter((request) => request.id !== nextRequest.id);
  return [nextRequest, ...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function applyManagerDecision(
  request: StoredExpenseRequest,
  decision: ReviewerDecisionState,
  reviewerNote?: string,
): StoredExpenseRequest {
  const decidedAt = new Date().toISOString();
  const managerDecision: ReviewerDecision = {
    decision,
    reviewerNote,
    decidedAt,
    requestId: request.id,
  };

  return {
    ...request,
    updatedAt: decidedAt,
    managerDecision,
    status: mapDecisionToStatus(decision),
  };
}

export function mapDecisionToStatus(decision: ReviewerDecisionState): RequestWorkflowStatus {
  switch (decision) {
    case "approve":
      return "approved";
    case "deny":
      return "denied";
    case "review":
      return "review";
    case "investigate":
      return "investigate";
  }
}

export function formatRequestStatus(value: RequestWorkflowStatus) {
  if (value === "new") {
    return "New Requests";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}
