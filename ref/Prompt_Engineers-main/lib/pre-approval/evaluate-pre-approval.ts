import { DEFAULT_CLASSIFICATION_COUNTS, DEFAULT_SEVERITY_COUNTS } from "@/lib/compliance/defaults";
import { BRIM_POLICY } from "@/lib/policy/brim-policy";
import { buildReviewerContext } from "@/lib/pre-approval/mock-enrichment";
import { formatCurrency } from "@/lib/transactions/format";
import type { NormalizedTransaction } from "@/types/transactions";
import type {
  ExpenseRequest,
  PolicyCheck,
  PreApprovalCheckSummary,
  PreApprovalEvaluation,
  RecommendationState,
} from "@/types/pre-approval";

export function evaluatePreApproval(
  request: ExpenseRequest,
  transactions: NormalizedTransaction[],
): PreApprovalEvaluation {
  const checks: PolicyCheck[] = [];
  const requiredActions = new Set<string>();
  const businessPurpose = request.businessPurpose.toLowerCase();
  const merchantName = (request.merchantName ?? "").toLowerCase();
  const notes = (request.notes ?? "").toLowerCase();
  const alcoholContext = (request.alcoholContext ?? "").toLowerCase();
  const combinedText = `${businessPurpose} ${merchantName} ${notes} ${alcoholContext}`;

  if (request.amount > BRIM_POLICY.preAuthorizationThreshold) {
    checks.push({
      code: "manager_pre_authorization",
      title: "Manager pre-authorization required",
      group: "workflow",
      severity: "low",
      status: "flag",
      detail: `This request is above ${formatCurrency(
        BRIM_POLICY.preAuthorizationThreshold,
      )}, so manager pre-authorization is required before spend.`,
    });
    requiredActions.add("Secure manager pre-authorization before the expense is incurred.");
  } else {
    checks.push({
      code: "manager_pre_authorization",
      title: "Manager pre-authorization threshold",
      group: "info",
      severity: "low",
      status: "pass",
      detail: `Amount is at or below the ${formatCurrency(
        BRIM_POLICY.preAuthorizationThreshold,
      )} workflow threshold.`,
    });
  }

  if (request.paymentMethod !== "corporate_card") {
    checks.push({
      code: "receipt_required",
      title: "Receipt required before reimbursement",
      group: "workflow",
      severity: "medium",
      status: "needs_info",
      detail: "Receipts are required before reimbursement, so the reviewer should confirm they will be collected.",
    });
    requiredActions.add("Collect an itemized receipt before reimbursement is processed.");
  } else {
    checks.push({
      code: "receipt_required",
      title: "Receipt expectation",
      group: "info",
      severity: "low",
      status: "pass",
      detail: "Corporate card usage still requires supporting receipts for later review.",
    });
  }

  if (request.customerEntertainment) {
    const entertainmentComplete =
      Boolean(request.guestNames?.trim()) && request.businessPurpose.trim().length >= 12;

    checks.push({
      code: "customer_entertainment_context",
      title: "Customer entertainment documentation",
      group: entertainmentComplete ? "info" : "workflow",
      severity: entertainmentComplete ? "low" : "medium",
      status: entertainmentComplete ? "pass" : "needs_info",
      detail: entertainmentComplete
        ? "Guest names and business purpose are present for customer entertainment review."
        : "Customer entertainment requires guest names and a clear business purpose.",
    });

    if (!entertainmentComplete) {
      if (!request.guestNames?.trim()) {
        requiredActions.add("Add the customer guest names for entertainment review.");
      }

      if (request.businessPurpose.trim().length < 12) {
        requiredActions.add("Clarify the business purpose for the entertainment request.");
      }
    }
  }

  if (request.alcoholIncluded) {
    if (!request.customerEntertainment) {
      checks.push({
        code: "alcohol_without_customer_context",
        title: "Alcohol is not allowed without customer dining context",
        group: "risk",
        severity: "high",
        status: "flag",
        detail: "Alcoholic beverages are not permitted unless the meal is clearly tied to customer dining.",
      });
    } else if (!request.guestNames || (request.alcoholContext ?? "").trim().length < 8) {
      checks.push({
        code: "alcohol_context_incomplete",
        title: "Alcohol requires stronger customer context",
        group: "risk",
        severity: "medium",
        status: "needs_info",
        detail: "Alcohol may be acceptable with customer entertainment, but the supporting context is incomplete.",
      });
      requiredActions.add("Document the customer dining context for the alcohol expense.");
    } else {
      checks.push({
        code: "alcohol_context_complete",
        title: "Alcohol context captured",
        group: "info",
        severity: "low",
        status: "pass",
        detail: "Customer entertainment context is present, so the reviewer can assess alcohol policy fit manually.",
      });
    }
  }

  if (
    (request.tipAmount ?? 0) > 0 &&
    request.amount > 0 &&
    ["meal", "client_entertainment", "taxi"].includes(request.expenseType)
  ) {
    const tipRate = (request.tipAmount ?? 0) / request.amount;
    const threshold = request.tipContext === "service" ? 0.15 : 0.2;
    const limitLabel = request.tipContext === "service" ? "15%" : "20%";

    checks.push({
      code: "tip_threshold",
      title: "Tip policy threshold",
      group: tipRate > threshold ? "risk" : "info",
      severity: tipRate > threshold ? "medium" : "low",
      status: tipRate > threshold ? "flag" : "pass",
      detail:
        tipRate > threshold
          ? `Tip appears above the ${limitLabel} reimbursement threshold for this request type.`
          : `Tip appears within the ${limitLabel} reimbursement threshold.`,
    });

    if (tipRate > threshold) {
      requiredActions.add("Confirm the proposed tip is policy-compliant or revise the amount.");
    }
  }

  if (
    request.expenseType === "ticket" ||
    /\b(ticket|traffic|speeding|parking ticket|violation|fine|penalty)\b/.test(combinedText)
  ) {
    checks.push({
      code: "ticket_not_reimbursable",
      title: "Tickets and fines are not reimbursable",
      group: "risk",
      severity: "high",
      status: "flag",
      detail: "Traffic and parking tickets are explicitly outside reimbursable business expense policy.",
    });
  }

  if (
    request.expenseType === "credit_card_fee" ||
    /\b(annual fee|card fee|credit card fee)\b/.test(combinedText)
  ) {
    checks.push({
      code: "personal_credit_card_fee",
      title: "Personal credit card fees are not reimbursable",
      group: "risk",
      severity: "high",
      status: "flag",
      detail: "Personal credit card fees are not reimbursable under the Brim policy.",
    });
  }

  const personalPurposeMatch = /\b(personal|family|birthday|vacation|commute|home|gift|spouse|anniversary)\b/.test(
    combinedText,
  );

  if (request.businessPurpose.trim().length < 10) {
    checks.push({
      code: "business_purpose_incomplete",
      title: "Business purpose is incomplete",
      group: "risk",
      severity: "high",
      status: "needs_info",
      detail: "The request needs a clearer business purpose before a confident decision can be made.",
    });
    requiredActions.add("Expand the business purpose so the reviewer can confirm business need.");
  } else if (personalPurposeMatch) {
    checks.push({
      code: "personal_expense_signal",
      title: "Possible personal expense signal",
      group: "risk",
      severity: "high",
      status: "flag",
      detail: "The stated purpose includes language that looks personal rather than business-related.",
    });
  } else {
    checks.push({
      code: "business_purpose_present",
      title: "Business purpose captured",
      group: "info",
      severity: "low",
      status: "pass",
      detail: "The request includes a stated business purpose for reviewer assessment.",
    });
  }

  if (request.paymentMethod === "corporate_card" && personalPurposeMatch) {
    checks.push({
      code: "corporate_card_business_only",
      title: "Corporate cards are for business expenses only",
      group: "risk",
      severity: "high",
      status: "flag",
      detail: "The request uses a corporate card while the stated purpose may be personal, which is explicitly prohibited.",
    });
  }

  if (
    request.transportType === "car_rental" ||
    request.expenseType === "car_rental"
  ) {
    if (!request.travelRelated || request.businessPurpose.trim().length < 18) {
      checks.push({
        code: "car_rental_reasonableness",
        title: "Car rental needs business necessity context",
        group: "workflow",
        severity: "medium",
        status: "needs_info",
        detail: "Car rental can be reimbursable when necessary, but the current request needs clearer context about necessity.",
      });
      requiredActions.add("Explain why car rental is the necessary and cost-effective transport option.");
    } else {
      checks.push({
        code: "car_rental_reasonableness",
        title: "Car rental context provided",
        group: "info",
        severity: "low",
        status: "pass",
        detail: "The request includes basic business context for the car rental decision.",
      });
    }

    if (!request.travelerCount) {
      checks.push({
        code: "car_rental_traveler_count",
        title: "Traveler count should be captured",
        group: "workflow",
        severity: "medium",
        status: "needs_info",
        detail: "Traveler count helps the reviewer judge whether shared transportation expectations were considered.",
      });
      requiredActions.add("Add traveler count for the car rental request.");
    } else if (request.travelerCount >= 4) {
      checks.push({
        code: "car_rental_sharing_support",
        title: "Traveler count supports shared transport logic",
        group: "info",
        severity: "low",
        status: "pass",
        detail: "Multiple travelers support the reasonableness of a shared rental car.",
      });
    } else if (request.travelerCount > 1) {
      checks.push({
        code: "car_rental_sharing_note",
        title: "Shared car expectation should be confirmed",
        group: "workflow",
        severity: "low",
        status: "flag",
        detail: "Multiple travelers are listed, so the reviewer should confirm shared transport was considered.",
      });
    }
  }

  if (request.travelRelated || isTransportExpense(request)) {
    const hasLocation = Boolean(request.locationCity || request.locationCountry);
    const hasTransportType = Boolean(request.transportType || inferTransportTypeFromExpense(request));

    if (!hasLocation) {
      checks.push({
        code: "travel_location_missing",
        title: "Travel location is incomplete",
        group: "workflow",
        severity: "medium",
        status: "needs_info",
        detail: "Travel-related requests should include city or country context for reviewer validation.",
      });
      requiredActions.add("Add the travel city or country for the request.");
    }

    if (!hasTransportType && request.travelRelated) {
      checks.push({
        code: "transport_mode_missing",
        title: "Transport details are incomplete",
        group: "workflow",
        severity: "medium",
        status: "needs_info",
        detail: "Travel-related requests should identify the transport type to support a cost-effectiveness review.",
      });
      requiredActions.add("Identify the transport type used for this travel-related request.");
    }
  }

  if (
    request.employeeId &&
    request.departmentId &&
    !employeeBelongsToDepartment(request.employeeId, request.departmentId)
  ) {
    checks.push({
      code: "directory_mismatch",
      title: "Employee and department selection do not match demo directory data",
      group: "risk",
      severity: "medium",
      status: "needs_info",
      detail: "The selected employee normally maps to a different department in the demo directory, so the reviewer should confirm the routing.",
    });
    requiredActions.add("Confirm the employee and department routing for this request.");
  }

  if (checks.length === 0) {
    checks.push({
      code: "baseline_review",
      title: "No policy conflict detected",
      group: "info",
      severity: "low",
      status: "pass",
      detail: "The request did not trigger any additional policy or workflow findings.",
    });
  }

  const summary = buildSummary(checks);
  const recommendation = deriveRecommendation(checks);
  const rationale = buildRationale(checks, recommendation);
  const reviewerContext = buildReviewerContext(request, transactions);

  return {
    request,
    checks,
    summary,
    recommendation,
    rationale,
    reviewerContext,
    requiredActions: [...requiredActions],
  };
}

function buildSummary(checks: PolicyCheck[]): PreApprovalCheckSummary {
  const summary: PreApprovalCheckSummary = {
    totalChecks: checks.length,
    severityCounts: { ...DEFAULT_SEVERITY_COUNTS },
    classificationCounts: { ...DEFAULT_CLASSIFICATION_COUNTS },
  };

  for (const check of checks) {
    summary.severityCounts[check.severity] += 1;
    summary.classificationCounts[check.group] += 1;
  }

  return summary;
}

function deriveRecommendation(checks: PolicyCheck[]): RecommendationState {
  const highRiskFlags = checks.filter(
    (check) => check.group === "risk" && check.severity === "high" && check.status === "flag",
  );
  const riskNeedsInfo = checks.filter(
    (check) => check.group === "risk" && check.status === "needs_info",
  );
  const workflowGaps = checks.filter((check) => check.group === "workflow" && check.status !== "pass");
  const mediumOrHigherRisk = checks.filter(
    (check) =>
      check.group === "risk" &&
      check.status !== "pass" &&
      (check.severity === "high" || check.severity === "medium"),
  );

  const denyCodes = new Set([
    "ticket_not_reimbursable",
    "personal_credit_card_fee",
    "alcohol_without_customer_context",
    "corporate_card_business_only",
  ]);

  if (highRiskFlags.some((check) => denyCodes.has(check.code))) {
    return "deny";
  }

  if (highRiskFlags.length >= 2 || (highRiskFlags.length >= 1 && riskNeedsInfo.length >= 1)) {
    return "investigate";
  }

  if (mediumOrHigherRisk.length > 0 || workflowGaps.length > 0 || riskNeedsInfo.length > 0) {
    return "review";
  }

  return "approve";
}

function buildRationale(checks: PolicyCheck[], recommendation: RecommendationState) {
  const flaggedChecks = checks
    .filter((check) => check.status !== "pass")
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 4);

  const rationale = flaggedChecks.map((check) => check.detail);

  if (recommendation === "approve" && rationale.length === 0) {
    rationale.push("No clear policy conflict or missing information was detected in the submitted request.");
  }

  if (recommendation === "review") {
    rationale.unshift("The request looks potentially valid, but the reviewer still needs to confirm workflow steps or ambiguous policy details.");
  }

  if (recommendation === "investigate") {
    rationale.unshift("The request contains multiple meaningful policy concerns or contradictions that need closer human review.");
  }

  if (recommendation === "deny") {
    rationale.unshift("The request conflicts with explicit policy rules strongly enough that it should not be approved as submitted.");
  }

  return rationale;
}

function inferTransportTypeFromExpense(request: ExpenseRequest) {
  if (request.expenseType === "taxi") {
    return "taxi";
  }

  if (request.expenseType === "parking") {
    return "parking";
  }

  if (request.expenseType === "car_rental") {
    return "car_rental";
  }

  return undefined;
}

function isTransportExpense(request: ExpenseRequest) {
  return ["taxi", "parking", "toll", "car_rental"].includes(request.expenseType);
}

function employeeBelongsToDepartment(employeeId: string, departmentId: string) {
  const mapping: Record<string, string> = {
    "emp-maya-chen": "sales",
    "emp-liam-patel": "operations",
    "emp-zoe-martin": "finance",
  };

  return mapping[employeeId] === departmentId;
}

function severityRank(value: PolicyCheck["severity"]) {
  switch (value) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
      return 2;
  }
}
