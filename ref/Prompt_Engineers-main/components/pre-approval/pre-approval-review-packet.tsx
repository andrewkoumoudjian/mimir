import { RecommendationBadge } from "@/components/pre-approval/recommendation-badge";
import {
  formatExpenseTypeLabel,
  formatPaymentMethodLabel,
  formatTransportTypeLabel,
} from "@/lib/pre-approval/mock-enrichment";
import { formatCurrency } from "@/lib/transactions/format";
import type { PreApprovalEvaluation } from "@/types/pre-approval";

type PreApprovalReviewPacketProps = {
  evaluation?: PreApprovalEvaluation | null;
};

const checkGroups = ["risk", "workflow", "info"] as const;

export function PreApprovalReviewPacket({ evaluation }: PreApprovalReviewPacketProps) {
  if (!evaluation) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Decision support</h2>
          </div>
        </div>
        <p className="muted-line">Submit a request to load the review packet.</p>
      </section>
    );
  }

  const { request, summary } = evaluation;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Decision support</h2>
        </div>
        <div className="recommendation-header-block">
          <span className="muted-line">Recommendation</span>
          <RecommendationBadge recommendation={evaluation.recommendation} />
        </div>
      </div>

      <div className="compliance-summary-grid">
        <article className="metric-card compliance-summary-card">
          <p className="metric-label">Risk findings</p>
          <h3 className="metric-value">{summary.classificationCounts.risk}</h3>
          <p className="metric-helper">Potential policy conflict or legitimacy concern</p>
        </article>
        <article className="metric-card compliance-summary-card">
          <p className="metric-label">Workflow findings</p>
          <h3 className="metric-value">{summary.classificationCounts.workflow}</h3>
          <p className="metric-helper">Required context or approval follow-up</p>
        </article>
        <article className="metric-card compliance-summary-card">
          <p className="metric-label">Info findings</p>
          <h3 className="metric-value">{summary.classificationCounts.info}</h3>
          <p className="metric-helper">Context that helps the reviewer decide faster</p>
        </article>
        <article className="metric-card compliance-summary-card">
          <p className="metric-label">High severity</p>
          <h3 className="metric-value">{summary.severityCounts.high}</h3>
          <p className="metric-helper">Most urgent findings in the request packet</p>
        </article>
      </div>

      <div className="content-grid">
        <section className="panel pre-approval-nested-panel">
          <div className="panel-header">
            <div>
              <h2>Request</h2>
            </div>
          </div>
          <dl className="pre-approval-summary-list">
            <div>
              <dt>Employee</dt>
              <dd>{request.employeeName}</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>{request.departmentName}</dd>
            </div>
            <div>
              <dt>Approver</dt>
              <dd>{request.approverName}</dd>
            </div>
            <div>
              <dt>Expense type</dt>
              <dd>{formatExpenseTypeLabel(request.expenseType)}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{formatCurrency(request.amount)}</dd>
            </div>
            <div>
              <dt>Payment method</dt>
              <dd>{formatPaymentMethodLabel(request.paymentMethod)}</dd>
            </div>
            <div>
              <dt>Travel-related</dt>
              <dd>{request.travelRelated ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt>Transport</dt>
              <dd>
                {request.transportType ? formatTransportTypeLabel(request.transportType) : "Not specified"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel pre-approval-nested-panel">
          <div className="panel-header">
            <div>
              <h2>Rationale</h2>
            </div>
          </div>
          <ul className="quality-list">
            {evaluation.rationale.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="content-grid">
        <section className="panel pre-approval-nested-panel">
          <div className="panel-header">
            <div>
              <h2>Required follow-up</h2>
            </div>
          </div>
          {evaluation.requiredActions.length > 0 ? (
            <ul className="quality-list">
              {evaluation.requiredActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          ) : (
            <p className="muted-line">No additional follow-up was generated for this request.</p>
          )}
        </section>

        <section className="panel pre-approval-nested-panel">
          <div className="panel-header">
            <div>
              <h2>Context</h2>
            </div>
          </div>
          <ul className="quality-list">
            <li>
              Department budget remaining:{" "}
              {evaluation.reviewerContext.budgetRemaining !== undefined
                ? formatCurrency(evaluation.reviewerContext.budgetRemaining)
                : "Not available"}
            </li>
            {evaluation.reviewerContext.recentSimilarSpendSummary ? (
              <li>{evaluation.reviewerContext.recentSimilarSpendSummary}</li>
            ) : null}
            {evaluation.reviewerContext.priorRequestPatternSummary ? (
              <li>{evaluation.reviewerContext.priorRequestPatternSummary}</li>
            ) : null}
          </ul>
          <div className="pre-approval-data-notes">
            <p className="muted-line">Data notes</p>
            <ul className="quality-list">
              {evaluation.reviewerContext.dataSourceNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <div className="pre-approval-check-groups">
        {checkGroups.map((group) => {
          const checks = evaluation.checks.filter((check) => check.group === group);

          return (
            <section key={group} className="panel pre-approval-nested-panel">
              <div className="panel-header">
                <div>
                  <h2>{group.charAt(0).toUpperCase() + group.slice(1)}</h2>
                </div>
                <span className="muted-line">{checks.length} checks</span>
              </div>
              {checks.length > 0 ? (
                <div className="pre-approval-check-list">
                  {checks.map((check) => (
                    <article key={check.code} className="pre-approval-check-card">
                      <div className="pre-approval-check-header">
                        <strong>{check.title}</strong>
                        <div className="pre-approval-badge-row">
                          <span className={`classification-badge classification-${check.group}`}>
                            {group.charAt(0).toUpperCase() + group.slice(1)}
                          </span>
                          <span className={`severity-badge severity-${check.severity}`}>
                            {check.severity.charAt(0).toUpperCase() + check.severity.slice(1)}
                          </span>
                          <span className={`status-badge status-${check.status}`}>
                            {formatStatus(check.status)}
                          </span>
                        </div>
                      </div>
                      <p className="muted-line">{check.detail}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted-line">No checks were recorded in this group.</p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function formatStatus(value: string) {
  if (value === "needs_info") {
    return "Needs info";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}
