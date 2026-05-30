import { formatCurrency } from "@/lib/transactions/format";
import type {
  ExpenseReport,
  ExpenseReportStatus,
  ExpenseReportType,
  ReportFinding,
} from "@/types/expense-report";
import type {
  ComplianceFlag,
  ComplianceFlagType,
  NormalizedTransaction,
} from "@/types/transactions";

type TransactionSignal = {
  families: Set<"trip" | "meal" | "software" | "transport" | "entertainment">;
  hasLodging: boolean;
  hasAir: boolean;
};

type MutableCluster = {
  transactions: NormalizedTransaction[];
  startDate: string;
  endDate: string;
  countries: Set<string>;
  merchants: Set<string>;
  categories: Set<string>;
  familyCounts: Record<"trip" | "meal" | "software" | "transport" | "entertainment", number>;
  hasLodging: boolean;
  hasAir: boolean;
};

const KEYWORDS = {
  lodging: ["hotel", "inn", "marriott", "hilton", "airbnb", "lodging", "motel"],
  air: ["air", "airline", "airport", "flight", "westjet", "air canada", "delta"],
  meals: [
    "restaurant",
    "cafe",
    "coffee",
    "grill",
    "bistro",
    "bar",
    "deli",
    "dinner",
    "breakfast",
    "lunch",
    "pizza",
    "burger",
  ],
  entertainment: ["hospitality", "client", "guest", "entertainment", "dinner"],
  software: [
    "slack",
    "notion",
    "figma",
    "aws",
    "amazon web services",
    "google",
    "microsoft",
    "zoom",
    "adobe",
    "github",
    "dropbox",
    "docu",
    "sunco",
    "communication",
  ],
  transport: [
    "uber",
    "lyft",
    "taxi",
    "cab",
    "parking",
    "toll",
    "permit",
    "fuel",
    "pilot",
    "flying j",
    "love's",
    "loves",
    "cenex",
    "petro",
    "phillips 66",
    "scale",
    "truck",
    "carpio",
    "totum",
    "transport",
  ],
};

const STATUS_ORDER: Record<ExpenseReportStatus, number> = {
  investigate: 0,
  review: 1,
  ready: 2,
};

const FLAG_TITLES: Record<ComplianceFlagType, string> = {
  requires_pre_authorization: "Over-threshold spend appears inside the report",
  possible_split_transaction: "Possible split transaction pattern appears in the report",
  duplicate_transaction: "Duplicate transaction pattern appears in the report",
  near_duplicate_transaction: "Near-duplicate charge appears in the report",
  fee_or_cash_advance: "Fee or cash-advance-like activity appears in the report",
  needs_review: "Manual review fallback appears in the report",
};

export function buildExpenseReports(
  transactions: NormalizedTransaction[],
  flags: ComplianceFlag[],
): ExpenseReport[] {
  const positiveTransactions = transactions
    .filter((transaction) => transaction.amount > 0 && transaction.type !== "payment")
    .sort((left, right) => left.date.localeCompare(right.date) || left.amount - right.amount);

  const clusters: MutableCluster[] = [];

  for (const transaction of positiveTransactions) {
    const signal = deriveSignal(transaction);
    const matchingCluster = findBestCluster(clusters, transaction, signal);

    if (matchingCluster) {
      addTransactionToCluster(matchingCluster, transaction, signal);
      continue;
    }

    clusters.push(createCluster(transaction, signal));
  }

  return clusters
    .map((cluster, index) => buildReportFromCluster(cluster, index, flags))
    .sort((left, right) => {
      return (
        STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
        right.endDate.localeCompare(left.endDate) ||
        right.totalAmount - left.totalAmount
      );
    });
}

function buildReportFromCluster(
  cluster: MutableCluster,
  index: number,
  flags: ComplianceFlag[],
): ExpenseReport {
  const transactions = [...cluster.transactions].sort(
    (left, right) => left.date.localeCompare(right.date) || right.amount - left.amount,
  );
  const type = deriveReportType(cluster);
  const findings = buildReportFindings(cluster, flags, type);
  const status = deriveReportStatus(findings);
  const merchants = summarizeTopValues(transactions.map((transaction) => transaction.merchant));
  const categories = summarizeTopValues(
    transactions
      .map((transaction) => transaction.category)
      .filter((category): category is string => Boolean(category)),
  );

  return {
    id: `report-${index + 1}-${transactions[0]?.id ?? "empty"}`,
    type,
    title: buildReportTitle(type, cluster.startDate, cluster.endDate),
    status,
    transactionIds: transactions.map((transaction) => transaction.id),
    transactions,
    totalAmount: totalAmount(transactions),
    transactionCount: transactions.length,
    startDate: cluster.startDate,
    endDate: cluster.endDate,
    merchantSummary: merchants,
    categorySummary: categories,
    rationale: buildRationale(cluster, type, merchants, categories),
    findings,
    relatedFlagTypes: [
      ...new Set(
        findings
          .filter((finding) => finding.source === "compliance")
          .map((finding) => finding.code.split(":")[1] as ComplianceFlagType),
      ),
    ],
  };
}

function buildReportFindings(
  cluster: MutableCluster,
  flags: ComplianceFlag[],
  type: ExpenseReportType,
): ReportFinding[] {
  const transactionIds = new Set(cluster.transactions.map((transaction) => transaction.id));
  const matchingFlags = flags.filter((flag) => transactionIds.has(flag.transactionId));
  const findings: ReportFinding[] = [];
  const byType = new Map<ComplianceFlagType, ComplianceFlag[]>();

  for (const flag of matchingFlags) {
    const group = byType.get(flag.flagType) ?? [];
    group.push(flag);
    byType.set(flag.flagType, group);
  }

  for (const [flagType, groupedFlags] of byType.entries()) {
    const groupedTransactionIds = [...new Set(groupedFlags.map((flag) => flag.transactionId))];
    findings.push({
      code: `compliance:${flagType}`,
      title: FLAG_TITLES[flagType],
      group: groupedFlags[0]?.classification ?? "info",
      severity: maxSeverityForFlags(groupedFlags),
      detail: `${groupedTransactionIds.length} transaction${
        groupedTransactionIds.length === 1 ? "" : "s"
      } in this report carry the ${flagType.replace(/_/g, " ")} signal.`,
      transactionIds: groupedTransactionIds,
      source: "compliance",
    });
  }

  if (cluster.transactions.length === 1) {
    findings.push({
      code: "grouping:standalone",
      title: "Standalone report candidate",
      group: "info",
      severity: "low",
      detail:
        "This transaction did not fit a stronger multi-transaction cluster, so it remains a single-item report.",
      transactionIds: [...transactionIds],
      source: "grouping",
    });
  }

  const spanDays = daysBetween(cluster.startDate, cluster.endDate);
  const countryCount = [...cluster.countries].filter((country) => country !== "Unknown").length;

  if (type === "general" && cluster.transactions.length >= 4 && spanDays >= 3) {
    findings.push({
      code: "grouping:loose_general_cluster",
      title: "Loose general spend cluster",
      group: "workflow",
      severity: "medium",
      detail:
        "This report groups a broad set of general business transactions across several days, so a manager should confirm that the cluster belongs together.",
      transactionIds: [...transactionIds],
      source: "grouping",
    });
  }

  if (type === "trip" && !cluster.hasLodging && !cluster.hasAir && cluster.familyCounts.transport >= 2) {
    findings.push({
      code: "grouping:trip_inferred_from_transport_mix",
      title: "Trip grouping is inferred from transport-heavy activity",
      group: "workflow",
      severity: "low",
      detail:
        "The report is treated as trip-like because multiple transport-style charges sit close together in time, but the trip signal is operational rather than explicit lodging or airfare.",
      transactionIds: [...transactionIds],
      source: "grouping",
    });
  }

  if ((type === "meals" || type === "client_entertainment") && totalAmount(cluster.transactions) > 250) {
    findings.push({
      code: "grouping:elevated_meal_spend",
      title: "Elevated meal cluster total",
      group: "risk",
      severity: "medium",
      detail: `Meal-related transactions in this report total ${formatCurrency(
        totalAmount(cluster.transactions),
      )}, so a manager should confirm business purpose and supporting context.`,
      transactionIds: [...transactionIds],
      source: "grouping",
    });
  }

  if (type === "trip" && countryCount > 1) {
    findings.push({
      code: "grouping:cross_border_trip",
      title: "Cross-border travel cluster",
      group: "info",
      severity: "low",
      detail: "This report spans more than one country, which supports the trip-style grouping.",
      transactionIds: [...transactionIds],
      source: "grouping",
    });
  }

  return findings.sort((left, right) => {
    return (
      severityRank(right.severity) - severityRank(left.severity) ||
      left.title.localeCompare(right.title)
    );
  });
}

function deriveReportStatus(findings: ReportFinding[]): ExpenseReportStatus {
  const riskHigh = findings.filter((finding) => finding.group === "risk" && finding.severity === "high");
  const riskMedium = findings.filter(
    (finding) => finding.group === "risk" && finding.severity === "medium",
  );
  const workflowFindings = findings.filter((finding) => finding.group === "workflow");
  const suspiciousCompliance = findings.some(
    (finding) =>
      finding.code === "compliance:duplicate_transaction" ||
      finding.code === "compliance:possible_split_transaction",
  );

  if (suspiciousCompliance || riskHigh.length >= 1 || riskMedium.length >= 2) {
    return "investigate";
  }

  if (riskMedium.length >= 1 || workflowFindings.length >= 1) {
    return "review";
  }

  return "ready";
}

function deriveReportType(cluster: MutableCluster): ExpenseReportType {
  const transactionCount = Math.max(cluster.transactions.length, 1);
  const softwareRatio = cluster.familyCounts.software / transactionCount;
  const mealRatio = cluster.familyCounts.meal / transactionCount;
  const transportRatio = cluster.familyCounts.transport / transactionCount;
  const entertainmentRatio = cluster.familyCounts.entertainment / transactionCount;

  if (softwareRatio >= 0.5) {
    return "software";
  }

  if (
    cluster.hasAir ||
    cluster.hasLodging ||
    (cluster.familyCounts.transport >= 2 &&
      (cluster.familyCounts.meal >= 1 ||
        [...cluster.countries].filter((country) => country !== "Unknown").length > 1))
  ) {
    return "trip";
  }

  if (mealRatio >= 0.5 && entertainmentRatio > 0) {
    return "client_entertainment";
  }

  if (mealRatio >= 0.5) {
    return "meals";
  }

  if (transportRatio >= 0.5) {
    return "local_transport";
  }

  return "general";
}

function buildRationale(
  cluster: MutableCluster,
  type: ExpenseReportType,
  merchants: string[],
  categories: string[],
): string[] {
  const rationale = [
    `Grouped ${cluster.transactions.length} transaction${
      cluster.transactions.length === 1 ? "" : "s"
    } from ${buildShortDateRange(cluster.startDate, cluster.endDate)}.`,
  ];

  if (type === "trip") {
    rationale.push("Travel-like timing and merchant/category mix suggest a trip-style report.");
  } else if (type === "software") {
    rationale.push("Software and service-style merchants were clustered into a monthly spend bundle.");
  } else if (type === "local_transport") {
    rationale.push("Transport, permit, parking, fuel, or road-cost signals dominate this cluster.");
  } else if (type === "meals" || type === "client_entertainment") {
    rationale.push("Meal-oriented merchants occur close together in time and form a coherent spend event.");
  } else {
    rationale.push(
      "Date proximity and merchant/category similarity were strong enough to create a general business spend report.",
    );
  }

  if (merchants.length > 0) {
    rationale.push(`Top merchants: ${merchants.join(", ")}.`);
  }

  if (categories.length > 0) {
    rationale.push(`Leading categories: ${categories.join(", ")}.`);
  }

  return rationale;
}

function buildReportTitle(type: ExpenseReportType, startDate: string, endDate: string) {
  const dateLabel = buildShortDateRange(startDate, endDate);

  switch (type) {
    case "trip":
      return `Trip Expenses - ${dateLabel}`;
    case "client_entertainment":
      return `Meals & Entertainment - ${dateLabel}`;
    case "meals":
      return `Meals Cluster - ${dateLabel}`;
    case "local_transport":
      return `Local Transport Cluster - ${dateLabel}`;
    case "software":
      return `Software Spend Cluster - ${formatMonthYear(startDate)}`;
    case "general":
      return `General Business Spend - ${dateLabel}`;
  }
}

function findBestCluster(
  clusters: MutableCluster[],
  transaction: NormalizedTransaction,
  signal: TransactionSignal,
) {
  let bestCluster: MutableCluster | undefined;
  let bestScore = 0;

  for (let index = clusters.length - 1; index >= 0; index -= 1) {
    const cluster = clusters[index];
    const gap = daysBetween(cluster.endDate, transaction.date);

    if (gap < 0 || gap > maxWindow(cluster, signal)) {
      continue;
    }

    const score = scoreCompatibility(cluster, transaction, signal, gap);
    if (score > bestScore) {
      bestScore = score;
      bestCluster = cluster;
    }
  }

  return bestScore >= 3 ? bestCluster : undefined;
}

function scoreCompatibility(
  cluster: MutableCluster,
  transaction: NormalizedTransaction,
  signal: TransactionSignal,
  gap: number,
) {
  let score = 0;
  const category = transaction.category ?? "Unmapped";

  if (cluster.merchants.has(transaction.merchant)) {
    score += 3;
  }

  if (category !== "Unmapped" && cluster.categories.has(category)) {
    score += 1;
  }

  if (signal.families.has("software") && cluster.familyCounts.software > 0) {
    score += sameMonth(cluster.startDate, transaction.date) ? 5 : -4;
  }

  if (signal.families.has("meal") && cluster.familyCounts.meal > 0) {
    score += 3;
  }

  if (signal.families.has("transport") && cluster.familyCounts.transport > 0) {
    score += 3;
  }

  if (signal.families.has("trip") && cluster.familyCounts.trip > 0) {
    score += 4;
  }

  if (
    cluster.familyCounts.trip > 0 &&
    (signal.families.has("transport") || signal.families.has("meal"))
  ) {
    score += 2;
  }

  if (
    cluster.countries.has(transaction.country ?? "Unknown") ||
    cluster.countries.has("Unknown") ||
    (transaction.country ?? "Unknown") === "Unknown"
  ) {
    score += 1;
  }

  if (gap <= 1) {
    score += 2;
  } else if (gap <= 2) {
    score += 1;
  }

  return score;
}

function maxWindow(cluster: MutableCluster, signal: TransactionSignal) {
  if (signal.families.has("software") || cluster.familyCounts.software > 0) {
    return 35;
  }

  if (signal.families.has("trip") || cluster.familyCounts.trip > 0) {
    return 4;
  }

  return 2;
}

function createCluster(transaction: NormalizedTransaction, signal: TransactionSignal): MutableCluster {
  return {
    transactions: [transaction],
    startDate: transaction.date,
    endDate: transaction.date,
    countries: new Set([transaction.country ?? "Unknown"]),
    merchants: new Set([transaction.merchant]),
    categories: new Set([transaction.category ?? "Unmapped"]),
    familyCounts: {
      trip: signal.families.has("trip") ? 1 : 0,
      meal: signal.families.has("meal") ? 1 : 0,
      software: signal.families.has("software") ? 1 : 0,
      transport: signal.families.has("transport") ? 1 : 0,
      entertainment: signal.families.has("entertainment") ? 1 : 0,
    },
    hasLodging: signal.hasLodging,
    hasAir: signal.hasAir,
  };
}

function addTransactionToCluster(
  cluster: MutableCluster,
  transaction: NormalizedTransaction,
  signal: TransactionSignal,
) {
  cluster.transactions.push(transaction);
  cluster.startDate = cluster.startDate < transaction.date ? cluster.startDate : transaction.date;
  cluster.endDate = cluster.endDate > transaction.date ? cluster.endDate : transaction.date;
  cluster.countries.add(transaction.country ?? "Unknown");
  cluster.merchants.add(transaction.merchant);
  cluster.categories.add(transaction.category ?? "Unmapped");

  for (const family of signal.families) {
    cluster.familyCounts[family] += 1;
  }

  cluster.hasLodging ||= signal.hasLodging;
  cluster.hasAir ||= signal.hasAir;
}

function deriveSignal(transaction: NormalizedTransaction): TransactionSignal {
  const haystack = `${transaction.merchant} ${transaction.description} ${transaction.category ?? ""}`.toLowerCase();
  const families = new Set<"trip" | "meal" | "software" | "transport" | "entertainment">();
  const rawMcc = String(transaction.raw["Merchant Category Code"] ?? "");
  const category = transaction.category ?? "";
  const hasLodging = KEYWORDS.lodging.some((keyword) => haystack.includes(keyword)) || category === "Lodging";
  const hasAir = KEYWORDS.air.some((keyword) => haystack.includes(keyword));
  const hasMeal = KEYWORDS.meals.some((keyword) => haystack.includes(keyword)) || /^58/.test(rawMcc);
  const hasEntertainment = KEYWORDS.entertainment.some((keyword) => haystack.includes(keyword));
  const hasSoftware =
    KEYWORDS.software.some((keyword) => haystack.includes(keyword)) || category.includes("Telecom");
  const hasTransport =
    KEYWORDS.transport.some((keyword) => haystack.includes(keyword)) ||
    [
      "Taxi and Ride Services",
      "Road and Toll Charges",
      "Fuel",
      "Automated Fuel",
      "Vehicle Service",
      "Wash and Maintenance",
      "Automotive Parts",
      "Government Services",
      "Travel",
    ].includes(category);

  if (hasLodging || hasAir) {
    families.add("trip");
  }

  if (hasMeal) {
    families.add("meal");
  }

  if (hasEntertainment) {
    families.add("entertainment");
  }

  if (hasSoftware) {
    families.add("software");
  }

  if (hasTransport) {
    families.add("transport");
  }

  if (!hasSoftware && hasTransport && (transaction.country ?? "Unknown") !== "Unknown") {
    families.add("trip");
  }

  return {
    families,
    hasLodging,
    hasAir,
  };
}

function summarizeTopValues(values: string[]) {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([value]) => value);
}

function maxSeverityForFlags(flags: ComplianceFlag[]) {
  return flags.reduce<"low" | "medium" | "high">((current, flag) => {
    return severityRank(flag.severity) > severityRank(current) ? flag.severity : current;
  }, "low");
}

function severityRank(value: "low" | "medium" | "high") {
  switch (value) {
    case "low":
      return 0;
    case "medium":
      return 1;
    case "high":
      return 2;
  }
}

function totalAmount(transactions: NormalizedTransaction[]) {
  return transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
}

function daysBetween(left: string, right: string) {
  const leftDate = parseDateOnly(left);
  const rightDate = parseDateOnly(right);
  return Math.round((rightDate.getTime() - leftDate.getTime()) / (24 * 60 * 60 * 1000));
}

function sameMonth(left: string, right: string) {
  return left.slice(0, 7) === right.slice(0, 7);
}

function buildShortDateRange(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  const start = formatter.format(parseDateOnly(startDate));
  if (startDate === endDate) {
    return start;
  }

  return `${start} to ${formatter.format(parseDateOnly(endDate))}`;
}

function formatMonthYear(date: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDateOnly(date));
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}
