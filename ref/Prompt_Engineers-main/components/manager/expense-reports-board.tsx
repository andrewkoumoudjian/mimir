"use client";

import { useMemo, useState } from "react";
import { ExpenseReportDetail } from "@/components/manager/expense-report-detail";
import { ExpenseReportList } from "@/components/manager/expense-report-list";
import type { ExpenseReport, ExpenseReportStatus } from "@/types/expense-report";

type ExpenseReportsBoardProps = {
  reports: ExpenseReport[];
};

const statusSections: Array<{ status: ExpenseReportStatus; title: string }> = [
  { status: "ready", title: "Ready" },
  { status: "review", title: "Review" },
  { status: "investigate", title: "Investigate" },
];

export function ExpenseReportsBoard({ reports }: ExpenseReportsBoardProps) {
  const [activeStatus, setActiveStatus] = useState<ExpenseReportStatus>("review");
  const [selectedReportId, setSelectedReportId] = useState<string | undefined>(undefined);
  const visibleReports = useMemo(
    () => reports.filter((report) => report.status === activeStatus),
    [activeStatus, reports],
  );
  const selectedReport = useMemo(
    () => visibleReports.find((report) => report.id === selectedReportId) ?? visibleReports[0],
    [selectedReportId, visibleReports],
  );

  return (
    <div className="manager-board-shell">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-kicker">Historical reports</p>
            <h2>Review grouped expense reports</h2>
          </div>
          <span className="muted-line">{reports.length} total reports</span>
        </div>
        <div className="classification-tabs" role="tablist" aria-label="Expense report status filters">
          {statusSections.map((section) => (
            <button
              key={section.status}
              type="button"
              className={`classification-tab ${activeStatus === section.status ? "is-active" : ""}`}
              onClick={() => setActiveStatus(section.status)}
            >
              {section.title}
              <span className="classification-count">
                {reports.filter((report) => report.status === section.status).length}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="manager-board-layout manager-board-layout-split">
        <div className="manager-board-list-column">
          <ExpenseReportList
            title={statusSections.find((section) => section.status === activeStatus)?.title ?? "Reports"}
            status={activeStatus}
            reports={visibleReports}
            selectedReportId={selectedReport?.id}
            onSelect={setSelectedReportId}
          />
        </div>

        <div className="manager-board-detail-column">
          <ExpenseReportDetail report={selectedReport} />
        </div>
      </div>
    </div>
  );
}
