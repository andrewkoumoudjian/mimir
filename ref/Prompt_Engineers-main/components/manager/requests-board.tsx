"use client";

import { useMemo, useState } from "react";
import { RequestDetailPanel } from "@/components/manager/request-detail-panel";
import { RequestList } from "@/components/manager/request-list";
import { applyManagerDecision } from "@/lib/request-store";
import type {
  ReviewerDecisionState,
  RequestWorkflowStatus,
  StoredExpenseRequest,
} from "@/types/pre-approval";

type RequestsBoardProps = {
  requests: StoredExpenseRequest[];
  onUpdateRequest: (request: StoredExpenseRequest) => void;
};

const statusSections: Array<{ status: RequestWorkflowStatus; title: string }> = [
  { status: "new", title: "New Requests" },
  { status: "review", title: "Review" },
  { status: "investigate", title: "Investigate" },
  { status: "approved", title: "Approved" },
  { status: "denied", title: "Denied" },
];

export function RequestsBoard({ requests, onUpdateRequest }: RequestsBoardProps) {
  const [activeStatus, setActiveStatus] = useState<RequestWorkflowStatus>("new");
  const [selectedRequestId, setSelectedRequestId] = useState<string | undefined>(undefined);
  const visibleRequests = useMemo(
    () => requests.filter((request) => request.status === activeStatus),
    [activeStatus, requests],
  );
  const selectedRequest = useMemo(
    () =>
      visibleRequests.find((request) => request.id === selectedRequestId) ?? visibleRequests[0],
    [selectedRequestId, visibleRequests],
  );
  const [pendingDecision, setPendingDecision] = useState<ReviewerDecisionState | null>(null);
  const [managerNote, setManagerNote] = useState<string | null>(null);

  const effectivePendingDecision =
    pendingDecision ??
    selectedRequest?.managerDecision?.decision ??
    selectedRequest?.systemRecommendation ??
    "review";
  const effectiveManagerNote =
    managerNote ??
    selectedRequest?.managerDecision?.reviewerNote ??
    "";

  function handleSaveDecision() {
    if (!selectedRequest) {
      return;
    }

    onUpdateRequest(
      applyManagerDecision(
        selectedRequest,
        effectivePendingDecision,
        effectiveManagerNote.trim() || undefined,
      ),
    );
  }

  function handleResetDecision() {
    if (!selectedRequest) {
      return;
    }

    setPendingDecision(selectedRequest.managerDecision?.decision ?? selectedRequest.systemRecommendation);
    setManagerNote(selectedRequest.managerDecision?.reviewerNote ?? "");
  }

  function handleSelectRequest(requestId: string) {
    const nextRequest = requests.find((request) => request.id === requestId);
    setSelectedRequestId(requestId);
    setPendingDecision(
      nextRequest?.managerDecision?.decision ?? nextRequest?.systemRecommendation ?? "review",
    );
    setManagerNote(nextRequest?.managerDecision?.reviewerNote ?? "");
  }

  return (
    <div className="manager-board-shell">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-kicker">Manager queue</p>
            <h2>Review employee requests</h2>
          </div>
          <span className="muted-line">{requests.length} total requests</span>
        </div>
        <div className="classification-tabs" role="tablist" aria-label="Request status filters">
          {statusSections.map((section) => (
            <button
              key={section.status}
              type="button"
              className={`classification-tab ${activeStatus === section.status ? "is-active" : ""}`}
              onClick={() => {
                setActiveStatus(section.status);
                setSelectedRequestId(undefined);
                setPendingDecision(null);
                setManagerNote(null);
              }}
            >
              {section.title}
              <span className="classification-count">
                {requests.filter((request) => request.status === section.status).length}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="manager-board-layout manager-board-layout-split">
        <div className="manager-board-list-column">
          <RequestList
            title={statusSections.find((section) => section.status === activeStatus)?.title ?? "Requests"}
            status={activeStatus}
            requests={visibleRequests}
            selectedRequestId={selectedRequest?.id}
            onSelect={handleSelectRequest}
          />
        </div>

        <div className="manager-board-detail-column">
          <RequestDetailPanel
            request={selectedRequest}
            pendingDecision={effectivePendingDecision}
            managerNote={effectiveManagerNote}
            onDecisionChange={setPendingDecision}
            onManagerNoteChange={setManagerNote}
            onSaveDecision={handleSaveDecision}
            onResetDecision={handleResetDecision}
          />
        </div>
      </div>
    </div>
  );
}
