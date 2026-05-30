import { formatCurrency, formatDisplayDateRange } from "@/lib/transactions/format";
import type { ExpenseReport, ExpenseReportStatus } from "@/types/expense-report";

type ExpenseReportListProps = {
  title: string;
  status: ExpenseReportStatus;
  reports: ExpenseReport[];
  selectedReportId?: string;
  onSelect: (reportId: string) => void;
};

export function ExpenseReportList({
  title,
  status,
  reports,
  selectedReportId,
  onSelect,
}: ExpenseReportListProps) {
  return (
    <section className="panel manager-request-list-panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
        </div>
        <span className="muted-line">{reports.length}</span>
      </div>

      <div className="manager-request-list">
        {reports.length > 0 ? (
          reports.map((report) => (
            <button
              key={report.id}
              type="button"
              className={`manager-request-item ${selectedReportId === report.id ? "is-active" : ""}`}
              onClick={() => onSelect(report.id)}
            >
              <div className="manager-request-item-header">
                <strong>{report.title}</strong>
                <span className={`status-badge manager-status-badge report-status-${status}`}>
                  {formatStatusLabel(status)}
                </span>
              </div>
              <p className="muted-line">
                {formatTypeLabel(report.type)} • {formatCurrency(report.totalAmount)}
              </p>
              <p className="muted-line">
                {report.transactionCount} transaction{report.transactionCount === 1 ? "" : "s"} •{" "}
                {formatDisplayDateRange(report.startDate, report.endDate)}
              </p>
              <p className="muted-line">{report.rationale[0]}</p>
            </button>
          ))
        ) : (
          <p className="muted-line">No reports are currently in this section.</p>
        )}
      </div>
    </section>
  );
}

function formatStatusLabel(value: ExpenseReportStatus) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatTypeLabel(value: ExpenseReport["type"]) {
  switch (value) {
    case "trip":
      return "Trip";
    case "client_entertainment":
      return "Client Entertainment";
    case "meals":
      return "Meals";
    case "local_transport":
      return "Local Transport";
    case "software":
      return "Software / Subscriptions";
    case "general":
      return "General Business Spend";
  }
}
