"use client";

import { PreApprovalReviewPacket } from "@/components/pre-approval/pre-approval-review-packet";
import { ReviewerDecisionPanel } from "@/components/pre-approval/reviewer-decision-panel";
import { formatRequestStatus } from "@/lib/request-store";
import type {
  ReviewerDecisionState,
  StoredExpenseRequest,
} from "@/types/pre-approval";

type RequestDetailPanelProps = {
  request?: StoredExpenseRequest;
  pendingDecision: ReviewerDecisionState;
  managerNote: string;
  onDecisionChange: (decision: ReviewerDecisionState) => void;
  onManagerNoteChange: (note: string) => void;
  onSaveDecision: () => void;
  onResetDecision: () => void;
};

export function RequestDetailPanel({
  request,
  pendingDecision,
  managerNote,
  onDecisionChange,
  onManagerNoteChange,
  onSaveDecision,
  onResetDecision,
}: RequestDetailPanelProps) {
  if (!request) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>No request selected</h2>
          </div>
        </div>
        <p className="muted-line">Select a request from the list.</p>
      </section>
    );
  }

  return (
    <div className="manager-detail-layout">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{request.evaluation.request.employeeName}</h2>
          </div>
          <span className="muted-line">Submitted {formatDateTime(request.submittedAt)}</span>
        </div>
        <ul className="quality-list">
          <li>Status: {formatRequestStatus(request.status)}</li>
          <li>Recommendation: {request.systemRecommendation}</li>
          {request.managerDecision ? (
            <li>
              Manager decision: {request.managerDecision.decision} at{" "}
              {formatDateTime(request.managerDecision.decidedAt)}
            </li>
          ) : (
            <li>No manager decision recorded.</li>
          )}
        </ul>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Request details</h2>
          </div>
        </div>
        <dl className="pre-approval-summary-list">
          <div>
            <dt>Employee</dt>
            <dd>{request.evaluation.request.employeeName}</dd>
          </div>
          <div>
            <dt>Department</dt>
            <dd>{request.evaluation.request.departmentName}</dd>
          </div>
          <div>
            <dt>Approver</dt>
            <dd>{request.evaluation.request.approverName}</dd>
          </div>
          <div>
            <dt>Business purpose</dt>
            <dd>{request.evaluation.request.businessPurpose}</dd>
          </div>
          {request.evaluation.request.merchantName ? (
            <div>
              <dt>Merchant</dt>
              <dd>{request.evaluation.request.merchantName}</dd>
            </div>
          ) : null}
          <div>
            <dt>Request date</dt>
            <dd>{request.evaluation.request.requestDate}</dd>
          </div>
          {request.evaluation.request.eventDate ? (
            <div>
              <dt>Event date</dt>
              <dd>{request.evaluation.request.eventDate}</dd>
            </div>
          ) : null}
          <div>
            <dt>Travel-related</dt>
            <dd>{request.evaluation.request.travelRelated ? "Yes" : "No"}</dd>
          </div>
          {request.evaluation.request.locationCity || request.evaluation.request.locationCountry ? (
            <div>
              <dt>Location</dt>
              <dd>
                {[request.evaluation.request.locationCity, request.evaluation.request.locationCountry]
                  .filter(Boolean)
                  .join(", ")}
              </dd>
            </div>
          ) : null}
          {request.evaluation.request.guestNames ? (
            <div>
              <dt>Guest names</dt>
              <dd>{request.evaluation.request.guestNames}</dd>
            </div>
          ) : null}
          <div>
            <dt>Alcohol included</dt>
            <dd>{request.evaluation.request.alcoholIncluded ? "Yes" : "No"}</dd>
          </div>
        </dl>
      </section>

      <PreApprovalReviewPacket evaluation={request.evaluation} />

      <ReviewerDecisionPanel
        evaluation={request.evaluation}
        finalDecision={request.managerDecision ?? null}
        pendingDecision={pendingDecision}
        reviewerNote={managerNote}
        onDecisionChange={onDecisionChange}
        onReviewerNoteChange={onManagerNoteChange}
        onConfirmDecision={onSaveDecision}
        onResetDecision={onResetDecision}
        actorLabel="Manager"
      />
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
