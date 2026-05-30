"use client";

import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { AssistantPanel } from "@/components/assistant-panel";
import { ComplianceReview } from "@/components/compliance-review";
import { InsightList } from "@/components/insight-list";
import { ExpenseReportsBoard } from "@/components/manager/expense-reports-board";
import { RequestsBoard } from "@/components/manager/requests-board";
import { MetricCard } from "@/components/metric-card";
import { ExpenseRequestForm } from "@/components/pre-approval/expense-request-form";
import { PreApprovalReviewPacket } from "@/components/pre-approval/pre-approval-review-packet";
import { buildExpenseReports } from "@/lib/expense-reports/build-expense-reports";
import { RegionBreakdown } from "@/components/region-breakdown";
import { RoleToggle } from "@/components/role-toggle";
import { TopMerchantsTable } from "@/components/top-merchants-table";
import { TransactionTable } from "@/components/transaction-table";
import {
  createStoredExpenseRequest,
  loadStoredRequests,
  loadStoredRole,
  saveStoredRequests,
  saveStoredRole,
  upsertStoredExpenseRequest,
  type AppRole,
} from "@/lib/request-store";
import { DEFAULT_PRE_APPROVAL_FORM } from "@/lib/pre-approval/mock-enrichment";
import { formatCurrency, formatDisplayDateRange } from "@/lib/transactions/format";
import type { DashboardData } from "@/types/transactions";
import type {
  ExpenseRequestInput,
  PreApprovalEvaluation,
  StoredExpenseRequest,
} from "@/types/pre-approval";

type AppWorkspaceProps = {
  dashboard: DashboardData;
  initialManagerView: "dashboard" | "requests" | "reports";
};

export function AppWorkspace({
  dashboard,
  initialManagerView,
}: AppWorkspaceProps) {
  const [role, setRole] = useState<AppRole>("manager");
  const [requests, setRequests] = useState<StoredExpenseRequest[]>([]);
  const [formValue, setFormValue] = useState<ExpenseRequestInput>(DEFAULT_PRE_APPROVAL_FORM);
  const [evaluation, setEvaluation] = useState<PreApprovalEvaluation | null>(null);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const expenseReports = useMemo(
    () => buildExpenseReports(dashboard.transactions, dashboard.compliance.flags),
    [dashboard.compliance.flags, dashboard.transactions],
  );

  useEffect(() => {
    setRole(loadStoredRole());
    setRequests(loadStoredRequests());
  }, []);

  useEffect(() => {
    saveStoredRole(role);
  }, [role]);

  useEffect(() => {
    saveStoredRequests(requests);
  }, [requests]);

  const requestCount = requests.length;
  const reportCount = expenseReports.length;
  const currentManagerView = initialManagerView;
  const managerHeadline =
    currentManagerView === "dashboard"
      ? "Operations"
      : currentManagerView === "requests"
        ? "Requests"
        : "Expense reports";

  async function handleEmployeeSubmit() {
    setIsSubmitting(true);
    setError(null);
    setSubmissionMessage(null);

    try {
      const response = await fetch("/api/pre-approval", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(formValue),
      });

      const payload = (await response.json()) as PreApprovalEvaluation & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "The request could not be evaluated.");
      }

      const storedRequest = createStoredExpenseRequest(payload);
      setRequests((current) => upsertStoredExpenseRequest(current, storedRequest));
      setEvaluation(payload);
      setSubmissionMessage(
        "Request submitted to the manager queue. Switch to Manager mode to review it in New Requests.",
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The request could not be evaluated.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleUpdateStoredRequest(nextRequest: StoredExpenseRequest) {
    setRequests((current) => upsertStoredExpenseRequest(current, nextRequest));
  }

  return (
    <main className="page-shell">
      <div className="app-topbar">
        {role === "manager" ? (
          <AppNav
            currentPath={
              currentManagerView === "dashboard"
                ? "/"
                : currentManagerView === "reports"
                  ? "/expense-reports"
                  : "/pre-approval"
            }
            role={role}
          />
        ) : (
          <div className="role-mode-label">
            <strong>Employee workspace</strong>
          </div>
        )}
        <RoleToggle
          role={role}
          onChange={(nextRole) => {
            setRole(nextRole);
          }}
        />
      </div>

      <section className="page-header">
        <div>
          <h1>{role === "manager" ? managerHeadline : "New expense request"}</h1>
        </div>
        <div className="dataset-chip">
          <span className="dataset-label">
            {role === "manager" ? "Workspace" : "Queue"}
          </span>
          <strong>{role === "manager" ? dashboard.source.datasetName : "Manager review queue"}</strong>
          <span>
            {role === "manager"
              ? currentManagerView === "dashboard"
                ? `${dashboard.summary.transactionCount} transactions`
                : currentManagerView === "reports"
                  ? `${reportCount} reports`
                : `${requestCount} requests`
              : `${requestCount} request${requestCount === 1 ? "" : "s"} available`}
          </span>
        </div>
      </section>

      {role === "manager" ? (
        <>
          {currentManagerView === "dashboard" ? (
            <div className="dashboard-layout">
              <section className="dashboard-column">
                <div className="metrics-grid">
                  <MetricCard
                    label="Total transactions"
                    value={dashboard.summary.transactionCount.toString()}
                    helperText="Loaded from the provided workbook"
                    compact
                  />
                  <MetricCard
                    label="Total spend"
                    value={formatCurrency(dashboard.summary.totalSpend)}
                    helperText="Positive spend only"
                    compact
                  />
                  <MetricCard
                    label="Risk alerts"
                    value={dashboard.compliance.summary.classificationCounts.risk.toString()}
                    helperText="Deterministic compliance engine"
                    compact
                  />
                  <MetricCard
                    label="Date range"
                    value={formatDisplayDateRange(
                      dashboard.summary.startDate,
                      dashboard.summary.endDate,
                    )}
                    helperText={`${dashboard.summary.countryCount} countries covered`}
                    compact
                  />
                </div>

                <div className="dashboard-focus-grid">
                  <section className="panel dashboard-activity-panel">
                    <div className="panel-header">
                      <div>
                        <h2>Recent signals</h2>
                      </div>
                      <span className="muted-line">{dashboard.insights.length} active findings</span>
                    </div>
                    <div className="dashboard-activity-layout">
                      <InsightList insights={dashboard.insights} />
                      <div className="dashboard-side-stack">
                        <TopMerchantsTable merchants={dashboard.summary.topMerchants} />
                        <RegionBreakdown regions={dashboard.summary.countryBreakdown.slice(0, 5)} />
                      </div>
                    </div>
                  </section>
                </div>

                <ComplianceReview
                  flags={dashboard.compliance.flags}
                  summary={dashboard.compliance.summary}
                />

                <TransactionTable transactions={dashboard.transactions.slice(0, 24)} />
              </section>

              <AssistantPanel
                datasetName={dashboard.source.datasetName}
                transactionCount={dashboard.summary.transactionCount}
                riskAlertCount={dashboard.compliance.summary.classificationCounts.risk}
                workflowItemCount={dashboard.compliance.summary.classificationCounts.workflow}
              />
            </div>
          ) : currentManagerView === "requests" ? (
            <RequestsBoard requests={requests} onUpdateRequest={handleUpdateStoredRequest} />
          ) : (
            <ExpenseReportsBoard reports={expenseReports} />
          )}
        </>
      ) : (
        <div className="employee-mode-layout">
          <ExpenseRequestForm
            value={formValue}
            isSubmitting={isSubmitting}
            onChange={setFormValue}
            onSubmit={() => {
              void handleEmployeeSubmit();
            }}
          />

          {error ? <p className="pre-approval-error">{error}</p> : null}
          {submissionMessage ? <p className="employee-submission-note">{submissionMessage}</p> : null}

          <PreApprovalReviewPacket evaluation={evaluation} />
        </div>
      )}
    </main>
  );
}
