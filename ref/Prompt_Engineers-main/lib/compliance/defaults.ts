import type {
  ComplianceClassification,
  ComplianceFlag,
  ComplianceSeverity,
  ComplianceSummary,
} from "@/types/transactions";

export const DEFAULT_CLASSIFICATION_COUNTS: Record<ComplianceClassification, number> = {
  risk: 0,
  workflow: 0,
  info: 0,
};

export const DEFAULT_SEVERITY_COUNTS: Record<ComplianceSeverity, number> = {
  high: 0,
  medium: 0,
  low: 0,
};

export const DEFAULT_COMPLIANCE_SUMMARY: ComplianceSummary = {
  totalFlags: 0,
  flaggedTransactionCount: 0,
  severityCounts: DEFAULT_SEVERITY_COUNTS,
  classificationCounts: DEFAULT_CLASSIFICATION_COUNTS,
  flagTypeCounts: [],
};

export function normalizeComplianceSummary(
  summary?: Partial<ComplianceSummary> | null,
): ComplianceSummary {
  return {
    totalFlags: summary?.totalFlags ?? DEFAULT_COMPLIANCE_SUMMARY.totalFlags,
    flaggedTransactionCount:
      summary?.flaggedTransactionCount ?? DEFAULT_COMPLIANCE_SUMMARY.flaggedTransactionCount,
    severityCounts: {
      ...DEFAULT_SEVERITY_COUNTS,
      ...(summary?.severityCounts ?? {}),
    },
    classificationCounts: {
      ...DEFAULT_CLASSIFICATION_COUNTS,
      ...(summary?.classificationCounts ?? {}),
    },
    flagTypeCounts: summary?.flagTypeCounts ?? DEFAULT_COMPLIANCE_SUMMARY.flagTypeCounts,
  };
}

export function normalizeComplianceFlag(flag: ComplianceFlag): ComplianceFlag {
  return {
    ...flag,
    classification: flag.classification ?? "info",
    details: flag.details ?? [],
  };
}
