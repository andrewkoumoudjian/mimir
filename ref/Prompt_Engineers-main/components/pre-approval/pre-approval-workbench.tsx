"use client";

import { useState } from "react";
import { ExpenseRequestForm } from "@/components/pre-approval/expense-request-form";
import { PreApprovalReviewPacket } from "@/components/pre-approval/pre-approval-review-packet";
import { ReviewerDecisionPanel } from "@/components/pre-approval/reviewer-decision-panel";
import { DEFAULT_PRE_APPROVAL_FORM } from "@/lib/pre-approval/mock-enrichment";
import type {
  ExpenseRequestInput,
  PreApprovalEvaluation,
  ReviewerDecision,
  ReviewerDecisionState,
} from "@/types/pre-approval";

export function PreApprovalWorkbench() {
  const [formValue, setFormValue] = useState<ExpenseRequestInput>(DEFAULT_PRE_APPROVAL_FORM);
  const [evaluation, setEvaluation] = useState<PreApprovalEvaluation | null>(null);
  const [pendingDecision, setPendingDecision] = useState<ReviewerDecisionState>("review");
  const [reviewerNote, setReviewerNote] = useState("");
  const [finalDecision, setFinalDecision] = useState<ReviewerDecision | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);

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

      setEvaluation(payload);
      setPendingDecision(payload.recommendation);
      setReviewerNote("");
      setFinalDecision(null);
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

  function handleConfirmDecision() {
    if (!evaluation) {
      return;
    }

    setFinalDecision({
      decision: pendingDecision,
      reviewerNote: reviewerNote.trim() || undefined,
      decidedAt: new Date().toISOString(),
      requestId: evaluation.request.id,
    });
  }

  function handleResetDecision() {
    if (!evaluation) {
      return;
    }

    setPendingDecision(evaluation.recommendation);
    setReviewerNote(finalDecision?.reviewerNote ?? "");
    setFinalDecision(null);
  }

  return (
    <div className="pre-approval-layout">
      <ExpenseRequestForm
        value={formValue}
        isSubmitting={isSubmitting}
        onChange={setFormValue}
        onSubmit={() => {
          void handleSubmit();
        }}
      />

      {error ? <p className="pre-approval-error">{error}</p> : null}

      <PreApprovalReviewPacket evaluation={evaluation} />

      <ReviewerDecisionPanel
        evaluation={evaluation}
        finalDecision={finalDecision}
        pendingDecision={pendingDecision}
        reviewerNote={reviewerNote}
        onDecisionChange={setPendingDecision}
        onReviewerNoteChange={setReviewerNote}
        onConfirmDecision={handleConfirmDecision}
        onResetDecision={handleResetDecision}
      />
    </div>
  );
}
