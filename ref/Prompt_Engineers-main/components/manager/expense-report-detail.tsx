"use client";

import { formatCurrency, formatDisplayDateRange } from "@/lib/transactions/format";
import type { ExpenseReport } from "@/types/expense-report";

type ExpenseReportDetailProps = {
  report?: ExpenseReport;
};

export function ExpenseReportDetail({ report }: ExpenseReportDetailProps) {
  if (!report) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>No report selected</h2>
          </div>
        </div>
        <p className="muted-line">Select a report from the list.</p>
      </section>
    );
  }

  return (
    <div className="manager-detail-layout">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{report.title}</h2>
          </div>
          <span className={`recommendation-badge recommendation-${report.status}`}>
            {report.status}
          </span>
        </div>

        <div className="compliance-summary-grid">
          <article className="metric-card compliance-summary-card">
            <p className="metric-label">Total amount</p>
            <p className="metric-value">{formatCurrency(report.totalAmount)}</p>
          </article>
          <article className="metric-card compliance-summary-card">
            <p className="metric-label">Transactions</p>
            <p className="metric-value">{report.transactionCount}</p>
          </article>
          <article className="metric-card compliance-summary-card">
            <p className="metric-label">Date range</p>
            <p className="metric-value report-metric-text">
              {formatDisplayDateRange(report.startDate, report.endDate)}
            </p>
          </article>
          <article className="metric-card compliance-summary-card">
            <p className="metric-label">Report type</p>
            <p className="metric-value report-metric-text">{formatTypeLabel(report.type)}</p>
          </article>
        </div>

        <dl className="pre-approval-summary-list">
          <div>
            <dt>Merchants</dt>
            <dd>{report.merchantSummary.join(", ") || "Not available"}</dd>
          </div>
          <div>
            <dt>Categories</dt>
            <dd>{report.categorySummary.join(", ") || "Not available"}</dd>
          </div>
          <div>
            <dt>Current report status</dt>
            <dd>{formatStatusLabel(report.status)}</dd>
          </div>
          <div>
            <dt>Related compliance flag types</dt>
            <dd>{report.relatedFlagTypes.length > 0 ? report.relatedFlagTypes.join(", ") : "None aggregated"}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Grouping rationale</h2>
          </div>
        </div>
        <ul className="quality-list">
          {report.rationale.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Findings</h2>
          </div>
        </div>
        <div className="pre-approval-check-list">
          {report.findings.length > 0 ? (
            report.findings.map((finding) => (
              <article key={finding.code} className="pre-approval-check-card">
                <div className="pre-approval-check-header">
                  <div>
                    <h3>{finding.title}</h3>
                    <p className="muted-line">{finding.detail}</p>
                  </div>
                  <div className="pre-approval-badge-row">
                    <span className={`classification-badge classification-${finding.group}`}>
                      {finding.group}
                    </span>
                    <span className={`severity-badge severity-${finding.severity}`}>
                      {finding.severity}
                    </span>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className="muted-line">
              No material findings were aggregated for this report. It is ready for manager review.
            </p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Transactions</h2>
          </div>
          <span className="muted-line">{report.transactionCount}</span>
        </div>
        <div className="table-scroll compliance-table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Merchant</th>
                <th>Description</th>
                <th>Category</th>
                <th>Country</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {report.transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.date}</td>
                  <td>{transaction.merchant}</td>
                  <td>{transaction.description}</td>
                  <td>{transaction.category ?? "Unmapped"}</td>
                  <td>{transaction.country ?? "Unknown"}</td>
                  <td>{formatCurrency(transaction.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function formatStatusLabel(value: ExpenseReport["status"]) {
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
