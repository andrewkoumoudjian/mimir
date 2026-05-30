import { formatExpenseTypeLabel } from "@/lib/pre-approval/mock-enrichment";
import { formatCurrency } from "@/lib/transactions/format";
import type { RequestWorkflowStatus, StoredExpenseRequest } from "@/types/pre-approval";

type RequestListProps = {
  title: string;
  status: RequestWorkflowStatus;
  requests: StoredExpenseRequest[];
  selectedRequestId?: string;
  onSelect: (requestId: string) => void;
};

export function RequestList({
  title,
  status,
  requests,
  selectedRequestId,
  onSelect,
}: RequestListProps) {
  return (
    <section className="panel manager-request-list-panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
        </div>
        <span className="muted-line">{requests.length}</span>
      </div>

      <div className="manager-request-list">
        {requests.length > 0 ? (
          requests.map((request) => (
            <button
              key={request.id}
              type="button"
              className={`manager-request-item ${
                selectedRequestId === request.id ? "is-active" : ""
              }`}
              onClick={() => onSelect(request.id)}
            >
              <div className="manager-request-item-header">
                <strong>{request.evaluation.request.employeeName}</strong>
                <span className={`status-badge manager-status-badge manager-status-${status}`}>
                  {formatStatusLabel(status)}
                </span>
              </div>
              <p className="muted-line">
                {request.evaluation.request.departmentName} •{" "}
                {formatExpenseTypeLabel(request.evaluation.request.expenseType)}
              </p>
              <p className="muted-line">
                {formatCurrency(request.evaluation.request.amount)} • Submitted{" "}
                {formatDate(request.submittedAt)}
              </p>
              <p className="muted-line">
                Recommendation: {request.systemRecommendation}
              </p>
            </button>
          ))
        ) : (
          <p className="muted-line">No requests are currently in this section.</p>
        )}
      </div>
    </section>
  );
}

function formatStatusLabel(value: RequestWorkflowStatus) {
  if (value === "new") {
    return "New";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(date);
}
