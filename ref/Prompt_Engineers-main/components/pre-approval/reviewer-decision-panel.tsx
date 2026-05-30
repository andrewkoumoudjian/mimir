"use client";

import { RecommendationBadge } from "@/components/pre-approval/recommendation-badge";
import { formatRecommendationLabel } from "@/lib/pre-approval/mock-enrichment";
import type {
  PreApprovalEvaluation,
  ReviewerDecision,
  ReviewerDecisionState,
} from "@/types/pre-approval";

type ReviewerDecisionPanelProps = {
  evaluation?: PreApprovalEvaluation | null;
  finalDecision?: ReviewerDecision | null;
  pendingDecision: ReviewerDecisionState;
  reviewerNote: string;
  actorLabel?: string;
  onDecisionChange: (decision: ReviewerDecisionState) => void;
  onReviewerNoteChange: (note: string) => void;
  onConfirmDecision: () => void;
  onResetDecision: () => void;
};

const decisionOptions: ReviewerDecisionState[] = [
  "approve",
  "deny",
  "review",
  "investigate",
];

export function ReviewerDecisionPanel({
  evaluation,
  finalDecision,
  pendingDecision,
  reviewerNote,
  actorLabel = "Reviewer",
  onDecisionChange,
  onReviewerNoteChange,
  onConfirmDecision,
  onResetDecision,
}: ReviewerDecisionPanelProps) {
  if (!evaluation) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{actorLabel} decision</h2>
          </div>
        </div>
        <p className="muted-line">Evaluate a request first.</p>
      </section>
    );
  }

  const differsFromRecommendation = pendingDecision !== evaluation.recommendation;
  const finalDiffers =
    finalDecision && finalDecision.decision !== evaluation.recommendation;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{actorLabel} decision</h2>
        </div>
      </div>

      <div className="decision-comparison-grid">
        <article className="panel pre-approval-nested-panel">
          <p className="metric-label">System recommendation</p>
          <RecommendationBadge recommendation={evaluation.recommendation} />
        </article>

        <article className="panel pre-approval-nested-panel">
          <p className="metric-label">Selected decision</p>
          {finalDecision ? (
            <>
              <RecommendationBadge recommendation={finalDecision.decision} />
              <p className="metric-helper">Recorded in the current session.</p>
            </>
          ) : (
            <>
              <RecommendationBadge recommendation={pendingDecision} />
              <p className="metric-helper">Choose the final outcome.</p>
            </>
          )}
        </article>
      </div>

      <div className="decision-option-grid" role="radiogroup" aria-label="Reviewer decision options">
        {decisionOptions.map((option) => (
          <button
            key={option}
            type="button"
            className={`decision-option ${pendingDecision === option ? "is-active" : ""}`}
            onClick={() => onDecisionChange(option)}
          >
            <strong>{formatRecommendationLabel(option)}</strong>
            <span>{decisionCopy(option)}</span>
          </button>
        ))}
      </div>

      <label className="pre-approval-field pre-approval-field-wide">
        <span>Reviewer note</span>
        <textarea
          rows={3}
          value={reviewerNote}
          onChange={(event) => onReviewerNoteChange(event.target.value)}
          placeholder={`Optional note explaining the final ${actorLabel.toLowerCase()} decision.`}
        />
      </label>

      {differsFromRecommendation ? (
        <p className="decision-warning">
          This decision differs from the system recommendation.
        </p>
      ) : null}

      <div className="pre-approval-form-actions">
        <div className="decision-action-row">
          <button
            type="button"
            className="pre-approval-submit"
            onClick={onConfirmDecision}
          >
            {finalDecision ? "Update decision" : "Record final decision"}
          </button>
          {finalDecision ? (
            <button
              type="button"
              className="decision-secondary-button"
              onClick={onResetDecision}
            >
              Change decision
            </button>
          ) : null}
        </div>
      </div>

      {finalDecision ? (
        <div className="decision-recorded-block">
          <p className="metric-label">Recorded</p>
          <ul className="quality-list">
            <li>Decision: {formatRecommendationLabel(finalDecision.decision)}</li>
            <li>Recorded at: {formatDecisionTimestamp(finalDecision.decidedAt)}</li>
            {finalDecision.reviewerNote ? <li>Reviewer note: {finalDecision.reviewerNote}</li> : null}
            {finalDiffers ? <li>This final decision differs from the system recommendation.</li> : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function decisionCopy(value: ReviewerDecisionState) {
  switch (value) {
    case "approve":
      return "Move forward with the request.";
    case "deny":
      return "Reject the request as submitted.";
    case "review":
      return "Hold for reviewer follow-up.";
    case "investigate":
      return "Escalate for closer scrutiny.";
  }
}

function formatDecisionTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
