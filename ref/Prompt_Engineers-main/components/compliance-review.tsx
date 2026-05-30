"use client";

import { useMemo, useState } from "react";
import {
  normalizeComplianceFlag,
  normalizeComplianceSummary,
} from "@/lib/compliance/defaults";
import { formatCompactDate, formatCurrency } from "@/lib/transactions/format";
import type {
  ComplianceClassification,
  ComplianceFlag,
  ComplianceFlagType,
  ComplianceSeverity,
  ComplianceSummary,
} from "@/types/transactions";

type ComplianceReviewProps = {
  flags?: ComplianceFlag[];
  summary?: ComplianceSummary;
};

const severityOptions: Array<ComplianceSeverity | "all"> = ["all", "high", "medium", "low"];
const classificationOptions: Array<ComplianceClassification | "all"> = [
  "risk",
  "workflow",
  "info",
  "all",
];

export function ComplianceReview({ flags, summary }: ComplianceReviewProps) {
  const [classificationFilter, setClassificationFilter] =
    useState<ComplianceClassification | "all">("risk");
  const [severityFilter, setSeverityFilter] = useState<ComplianceSeverity | "all">("all");
  const [flagTypeFilter, setFlagTypeFilter] = useState<ComplianceFlagType | "all">("all");
  const safeSummary = useMemo(() => normalizeComplianceSummary(summary), [summary]);
  const safeFlags = useMemo(
    () => (flags ?? []).map(normalizeComplianceFlag),
    [flags],
  );
  const filteredFlags = useMemo(() => {
    return safeFlags.filter((flag) => {
      const matchesClassification =
        classificationFilter === "all" ||
        flag.classification === classificationFilter;
      const matchesSeverity = severityFilter === "all" || flag.severity === severityFilter;
      const matchesType = flagTypeFilter === "all" || flag.flagType === flagTypeFilter;
      return matchesClassification && matchesSeverity && matchesType;
    });
  }, [classificationFilter, flagTypeFilter, safeFlags, severityFilter]);

  if (!summary) {
    return null;
  }

  const countsByClass = safeSummary.classificationCounts;
  const countsBySeverity = safeSummary.severityCounts;
  const totalFlags = safeSummary.totalFlags;
  const flagTypeCounts = safeSummary.flagTypeCounts;

  const visibleFlags = filteredFlags.slice(0, 250);
  const flagTypes = (flagTypeCounts || [])
    .map((item) => item.flagType)
    .filter((flagType) => {
      if (classificationFilter === "all") {
        return true;
      }

      return safeFlags.some(
        (flag) =>
          flag.flagType === flagType &&
          flag.classification === classificationFilter,
      );
    });

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="section-kicker">Compliance review</p>
          <h2>Policy compliance engine</h2>
        </div>
        <span className="muted-line">
          {countsByClass.risk} risk alerts prioritized
        </span>
      </div>

      <div className="compliance-summary-grid">
        <article className="metric-card compliance-summary-card">
          <p className="metric-label">Risk alerts</p>
          <h3 className="metric-value">{countsByClass.risk}</h3>
          <p className="metric-helper">Suspicious or policy-risk patterns</p>
        </article>
        <article className="metric-card compliance-summary-card">
          <p className="metric-label">Workflow items</p>
          <h3 className="metric-value">{countsByClass.workflow}</h3>
          <p className="metric-helper">Process requirements like pre-authorization</p>
        </article>
        <article className="metric-card compliance-summary-card">
          <p className="metric-label">Info items</p>
          <h3 className="metric-value">{countsByClass.info}</h3>
          <p className="metric-helper">Low-signal items kept visible for context</p>
        </article>
        <article className="metric-card compliance-summary-card">
          <p className="metric-label">High severity</p>
          <h3 className="metric-value">{countsBySeverity.high}</h3>
          <p className="metric-helper">Highest urgency items across all classes</p>
        </article>
      </div>

      <div className="classification-tabs" role="tablist" aria-label="Compliance grouping">
        {classificationOptions.map((option) => (
          <button
            key={option}
            type="button"
            className={`classification-tab ${classificationFilter === option ? "is-active" : ""}`}
            onClick={() => {
              setClassificationFilter(option);
              setFlagTypeFilter("all");
            }}
          >
            {option === "all" ? "All items" : formatClassification(option)}
            <span className="classification-count">
              {option === "all" ? totalFlags : countsByClass[option]}
            </span>
          </button>
        ))}
      </div>

      <div className="compliance-filters">
        <label className="filter-control">
          <span>View</span>
          <select
            value={classificationFilter}
            onChange={(event) => {
              const value = event.target.value as ComplianceClassification | "all";
              setClassificationFilter(value);
              setFlagTypeFilter("all");
            }}
          >
            {classificationOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All items" : formatClassification(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-control">
          <span>Severity</span>
          <select
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value as ComplianceSeverity | "all")}
          >
            {severityOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All severities" : capitalize(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-control">
          <span>Flag type</span>
          <select
            value={flagTypeFilter}
            onChange={(event) => setFlagTypeFilter(event.target.value as ComplianceFlagType | "all")}
          >
            <option value="all">All flag types</option>
            {flagTypes.map((flagType) => (
              <option key={flagType} value={flagType}>
                {formatFlagType(flagType)}
              </option>
            ))}
          </select>
        </label>

        <div className="filter-results">
          {classificationFilter === "risk"
            ? "Risk alerts are shown first by default."
            : classificationFilter === "workflow"
              ? "Workflow items stay visible without looking like violations."
              : classificationFilter === "info"
                ? "Info items remain available with lower prominence."
                : "All classes are visible together."}
          {" "}
          Showing {visibleFlags.length} of {filteredFlags.length} matching flags.
        </div>
      </div>

      <div className="table-scroll compliance-table-scroll">
        <table className="transactions-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Merchant</th>
              <th>Amount</th>
              <th>Class</th>
              <th>Flag type</th>
              <th>Severity</th>
              <th>Explanation</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {visibleFlags.map((flag) => (
              <tr key={flag.id}>
                <td>{formatCompactDate(flag.date)}</td>
                <td>{flag.merchant}</td>
                <td>{formatCurrency(flag.amount)}</td>
                <td>
                  <span className={`classification-badge classification-${flag.classification}`}>
                    {formatClassification(flag.classification)}
                  </span>
                </td>
                <td>{formatFlagType(flag.flagType)}</td>
                <td>
                  <span className={`severity-badge severity-${flag.severity}`}>
                    {capitalize(flag.severity)}
                  </span>
                </td>
                <td>{flag.explanation}</td>
                <td>
                  <details className="flag-details">
                    <summary>Why flagged</summary>
                    <div className="flag-transaction-id">Transaction ID: {flag.transactionId}</div>
                    <ul className="flag-detail-list">
                      {flag.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatFlagType(value: ComplianceFlagType) {
  return value
    .split("_")
    .map(capitalize)
    .join(" ");
}

function formatClassification(value: ComplianceClassification) {
  return capitalize(value);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
