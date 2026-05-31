import type {
	MiddayLikeTransaction,
	MimirRiskLevel,
	MimirSummary,
} from "./types";

export const EMPTY_SUMMARY: MimirSummary = {
	processed_rows: 0,
	flagged_rows: 0,
	review_rate: 0,
	threshold: 0,
	profile: "offline",
	model_version: "unavailable",
	risk_level_counts: {},
	primary_pattern_counts: {},
};

const SIGNAL_LABELS: Record<string, string> = {
	card_baseline: "Card baseline",
	categorical_surprisal: "Category surprise",
	temporal_velocity: "Velocity",
	graph_collective: "Shared entity graph",
	model_consensus: "Model consensus",
};

export function titleize(value: string) {
	return value
		.split(/[_\-\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

export function formatMoney(amount: number, currency = "CAD") {
	return new Intl.NumberFormat("en-CA", {
		style: "currency",
		currency,
		maximumFractionDigits: 0,
	}).format(amount);
}

export function formatPercent(value: number) {
	const normalized = value > 1 ? value / 100 : value;

	return new Intl.NumberFormat("en-CA", {
		style: "percent",
		maximumFractionDigits: 1,
	}).format(normalized);
}

export function formatDateTime(value: string) {
	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return new Intl.DateTimeFormat("en-CA", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

export function scorePercent(score: number) {
	return Math.round(score * 100);
}

export function riskClass(level?: string) {
	switch (level) {
		case "critical":
		case "high":
			return "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/10";
		case "medium":
			return "border-border bg-muted text-foreground hover:bg-muted";
		default:
			return "border-border bg-background text-muted-foreground hover:bg-background";
	}
}

export function statusClass(status?: string) {
	switch (status) {
		case "approved":
			return "border-primary/25 bg-primary/10 text-primary hover:bg-primary/10";
		case "escalated":
		case "blocked":
			return "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/10";
		case "dismissed":
		case "declined":
			return "border-border bg-muted text-muted-foreground hover:bg-muted";
		default:
			return "border-border bg-background text-foreground hover:bg-background";
	}
}

export function topReason(transaction: MiddayLikeTransaction) {
	return (
		transaction.reasons[0]?.message ?? titleize(transaction.primaryPattern)
	);
}

function median(values: number[]) {
	if (!values.length) {
		return 0;
	}

	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);

	if (sorted.length % 2 === 0) {
		return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
	}

	return sorted[middle] ?? 0;
}

function topEntry(values: string[]) {
	const counts = new Map<string, number>();

	for (const value of values) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}

	return (
		[...counts.entries()].sort(([, left], [, right]) => right - left)[0]?.[0] ??
		"Unknown"
	);
}

export function riskCounts(
	summary: MimirSummary,
	transactions: MiddayLikeTransaction[],
) {
	const counts = { low: 0, medium: 0, high: 0, critical: 0 };

	for (const level of Object.keys(counts) as MimirRiskLevel[]) {
		counts[level] =
			summary.risk_level_counts[level] ??
			transactions.filter((transaction) => transaction.riskLevel === level)
				.length;
	}

	return counts;
}

export function patternCounts(
	summary: MimirSummary,
	transactions: MiddayLikeTransaction[],
) {
	const source =
		Object.keys(summary.primary_pattern_counts).length > 0
			? summary.primary_pattern_counts
			: transactions.reduce<Record<string, number>>((acc, transaction) => {
					const key = transaction.primaryPattern || "unknown";
					acc[key] = (acc[key] ?? 0) + 1;
					return acc;
				}, {});

	return Object.entries(source)
		.sort(([, left], [, right]) => right - left)
		.map(([pattern, count]) => ({
			pattern,
			label: titleize(pattern),
			count,
		}));
}

export function componentSignalRows(transactions: MiddayLikeTransaction[]) {
	const rows = new Map<string, { total: number; active: number }>();

	for (const transaction of transactions) {
		for (const [key, value] of Object.entries(transaction.componentScores)) {
			const row = rows.get(key) ?? { total: 0, active: 0 };
			row.total += value;
			if (value >= 0.5) {
				row.active += 1;
			}
			rows.set(key, row);
		}
	}

	const divisor = Math.max(transactions.length, 1);

	return [...rows.entries()]
		.map(([key, row]) => ({
			key,
			label: SIGNAL_LABELS[key] ?? titleize(key),
			average: row.total / divisor,
			active: row.active,
		}))
		.sort((left, right) => right.average - left.average);
}

export function buildCardBaselines(transactions: MiddayLikeTransaction[]) {
	const groups = new Map<string, MiddayLikeTransaction[]>();

	for (const transaction of transactions) {
		const key = transaction.cardId || "unknown";
		groups.set(key, [...(groups.get(key) ?? []), transaction]);
	}

	return [...groups.entries()]
		.map(([cardId, cardTransactions]) => {
			const flagged = cardTransactions.filter(
				(transaction) => transaction.isFlagged,
			);
			const pending = flagged.filter(
				(transaction) => transaction.reviewStatus === "pending",
			);
			const countries = new Set(
				cardTransactions.map((transaction) => transaction.merchantCountry),
			);
			const devices = new Set(
				cardTransactions
					.map((transaction) => transaction.deviceId)
					.filter(Boolean),
			);
			const ips = new Set(
				cardTransactions
					.map((transaction) => transaction.ipAddress)
					.filter(Boolean),
			);
			const maxRisk = Math.max(
				...cardTransactions.map((transaction) => transaction.riskScore),
				0,
			);
			const riskiest = [...cardTransactions].sort(
				(left, right) => right.riskScore - left.riskScore,
			)[0];

			return {
				cardId,
				transactionCount: cardTransactions.length,
				flaggedCount: flagged.length,
				pendingCount: pending.length,
				reviewedCount: flagged.length - pending.length,
				maxRisk,
				riskLevel: riskiest?.riskLevel ?? "low",
				medianAmount: median(
					cardTransactions.map((transaction) => Math.abs(transaction.amount)),
				),
				flaggedExposure: flagged.reduce(
					(total, transaction) => total + Math.abs(transaction.amount),
					0,
				),
				topCategory: topEntry(
					cardTransactions.map((transaction) => transaction.merchantCategory),
				),
				countryCount: countries.size,
				deviceCount: devices.size,
				ipCount: ips.size,
				lastSignal: riskiest ? topReason(riskiest) : "No risk signal",
				href: `/transactions?card_id=${encodeURIComponent(cardId)}`,
				reviewHref: `/transactions?tab=review&card_id=${encodeURIComponent(cardId)}`,
			};
		})
		.sort((left, right) => {
			const riskDelta = right.maxRisk - left.maxRisk;
			if (riskDelta !== 0) {
				return riskDelta;
			}
			return right.flaggedCount - left.flaggedCount;
		});
}

type EntityKind = "device" | "ip" | "merchant";

export function buildEntityClusters(transactions: MiddayLikeTransaction[]) {
	const groups = new Map<
		string,
		{
			kind: EntityKind;
			id: string;
			transactions: MiddayLikeTransaction[];
		}
	>();

	const add = (
		kind: EntityKind,
		id: string | null | undefined,
		transaction: MiddayLikeTransaction,
	) => {
		if (!id) {
			return;
		}

		const key = `${kind}:${id}`;
		const group = groups.get(key) ?? { kind, id, transactions: [] };
		group.transactions.push(transaction);
		groups.set(key, group);
	};

	for (const transaction of transactions) {
		add("device", transaction.deviceId, transaction);
		add("ip", transaction.ipAddress, transaction);
		add("merchant", transaction.merchantName, transaction);
	}

	return [...groups.values()]
		.map((group) => {
			const cards = new Set(
				group.transactions.map((transaction) => transaction.cardId),
			);
			const flagged = group.transactions.filter(
				(transaction) => transaction.isFlagged,
			);
			const maxRisk = Math.max(
				...group.transactions.map((transaction) => transaction.riskScore),
				0,
			);
			const riskiest = [...group.transactions].sort(
				(left, right) => right.riskScore - left.riskScore,
			)[0];
			const hrefParam =
				group.kind === "device"
					? "device_id"
					: group.kind === "ip"
						? "ip_address"
						: "merchant_name";

			return {
				kind: group.kind,
				id: group.id,
				cardCount: cards.size,
				transactionCount: group.transactions.length,
				flaggedCount: flagged.length,
				maxRisk,
				riskLevel: riskiest?.riskLevel ?? "low",
				reason: riskiest ? topReason(riskiest) : "No risk signal",
				href: `/transactions?${hrefParam}=${encodeURIComponent(group.id)}`,
			};
		})
		.filter((group) => group.cardCount > 1 || group.flaggedCount > 0)
		.sort((left, right) => {
			const flaggedDelta = right.flaggedCount - left.flaggedCount;
			if (flaggedDelta !== 0) {
				return flaggedDelta;
			}
			const cardDelta = right.cardCount - left.cardCount;
			if (cardDelta !== 0) {
				return cardDelta;
			}
			return right.maxRisk - left.maxRisk;
		});
}

export function reviewStats(transactions: MiddayLikeTransaction[]) {
	const flagged = transactions.filter((transaction) => transaction.isFlagged);
	const reviewed = flagged.filter(
		(transaction) => transaction.reviewStatus !== "pending",
	);
	const pending = flagged.length - reviewed.length;
	const escalated = flagged.filter(
		(transaction) => transaction.reviewStatus === "escalated",
	).length;
	const approved = flagged.filter(
		(transaction) => transaction.reviewStatus === "approved",
	).length;
	const dismissed = flagged.filter(
		(transaction) => transaction.reviewStatus === "dismissed",
	).length;

	return {
		flagged: flagged.length,
		reviewed: reviewed.length,
		pending,
		escalated,
		approved,
		dismissed,
		exposure: flagged.reduce(
			(total, transaction) => total + Math.abs(transaction.amount),
			0,
		),
	};
}
