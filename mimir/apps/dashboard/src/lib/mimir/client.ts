import type {
	MiddayLikeTransaction,
	MimirReviewerAction,
	MimirSummary,
	MimirSyntheticLiveFeed,
	MimirTransactionContext,
	MimirTransactionRisk,
	PaginatedTransactions,
	TransactionsQueryInput,
} from "./types";

const DEFAULT_API_URL = "http://127.0.0.1:8787";
const DEFAULT_CURRENCY = "CAD";
const PAGE_SIZE = 40;

const CATEGORY_COLORS: Record<string, string> = {
	critical: "#ef4444",
	high: "#b45309",
	medium: "#737373",
	low: "#525252",
};
const DEFAULT_CATEGORY_COLOR = CATEGORY_COLORS.low ?? "#525252";

export const MIMIR_USER = {
	id: "mimir-reviewer",
	email: "fraud-reviewer@mimir.local",
	fullName: "Fraud Reviewer",
	avatarUrl: null,
	teamId: "mimir-team",
	team: {
		id: "mimir-team",
		name: "Mimir Fraud Desk",
		inboxId: "mimir-inbox",
		baseCurrency: DEFAULT_CURRENCY,
	},
	locale: "en-US",
	timezone: "America/Toronto",
	timezoneAutoSync: false,
	dateFormat: "MMM d, yyyy",
	timeFormat: "HH:mm",
	weekStartsOnMonday: true,
	fileKey: null,
};

export const MIMIR_TEAM = {
	id: "mimir-team",
	name: "Mimir Fraud Desk",
	baseCurrency: DEFAULT_CURRENCY,
	inboxId: "mimir-inbox",
	exportSettings: {
		csvDelimiter: ",",
		includeCSV: true,
		includeXLSX: true,
		sendEmail: false,
		sendCopyToMe: false,
		reviewerEmail: "",
	},
};

export const EMPTY_PAGINATED = {
	data: [],
	meta: {
		cursor: undefined,
		hasPreviousPage: false,
		hasNextPage: false,
	},
};

export type OverviewSummary = {
	openInvoices: { count: number; totalAmount: number; currency: string };
	unbilledTime: {
		totalDuration: number;
		totalAmount: number;
		projectCount: number;
		currency: string;
	};
	inboxPending: { count: number };
	transactionsToReview: { count: number };
	cashBalance: { totalBalance: number; currency: string; accountCount: number };
	runway: number;
};

type MimirAuditEvent = {
	transaction_id: string;
	action: string;
	from_status: string;
	to_status: string;
	reviewer: string;
	created_at: string;
	note?: string | null;
	original_score?: number | null;
};

export function getMimirApiBaseUrl() {
	return (
		process.env.NEXT_PUBLIC_MIMIR_API_URL ||
		process.env.MIMIR_API_URL ||
		process.env.NEXT_PUBLIC_API_URL ||
		DEFAULT_API_URL
	).replace(/\/$/, "");
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${getMimirApiBaseUrl()}${path}`, {
		...init,
		headers: {
			"Content-Type": "application/json",
			...init?.headers,
		},
		cache: "no-store",
	});

	if (!response.ok) {
		const message = await response.text().catch(() => response.statusText);
		throw new Error(`Mimir API ${response.status}: ${message}`);
	}

	return response.json() as Promise<T>;
}

function slugify(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function titleize(value: string) {
	return value
		.split(/[_\-\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function listify(value?: string[] | string | null) {
	if (!value) {
		return [];
	}

	return Array.isArray(value) ? value : [value];
}

function normalized(value: unknown) {
	return String(value ?? "").toLowerCase();
}

function matchesAny(
	candidate: unknown,
	values?: string[] | string | null,
	options: { slug?: boolean; exact?: boolean } = {},
) {
	const expected = listify(values).map(normalized).filter(Boolean);

	if (!expected.length) {
		return true;
	}

	const rawCandidate = normalized(candidate);
	const candidateValues = options.slug
		? [rawCandidate, slugify(rawCandidate)]
		: [rawCandidate];

	return expected.some((value) =>
		candidateValues.some((candidateValue) =>
			options.exact
				? candidateValue === value || slugify(candidateValue) === value
				: candidateValue.includes(value) ||
					slugify(candidateValue).includes(value),
		),
	);
}

function matchesRange(value: number, range?: number[] | null) {
	if (!range || range.length < 2) {
		return true;
	}

	const min = Number(range[0]);
	const max = Number(range[1]);
	return value >= min && value <= max;
}

function normalizeScoreRange(range?: number[] | null): [number, number] | null {
	if (!range || range.length < 2) {
		return null;
	}

	const min = Number(range[0]);
	const max = Number(range[1]);
	return max > 1 || min > 1 ? [min / 100, max / 100] : [min, max];
}

function isReviewQueueInput(input: TransactionsQueryInput = {}) {
	return input.fulfilled === true && input.exported === false;
}

function statusToWorkflowStatus(status: string) {
	switch (status) {
		case "approved":
			return "exported";
		case "dismissed":
			return "excluded";
		case "escalated":
		case "declined":
		case "blocked":
			return "archived";
		default:
			return "completed";
	}
}

function riskTags(transaction: MimirTransactionRisk) {
	const tags = [
		{
			id: `risk-${transaction.risk_level}`,
			name: titleize(transaction.risk_level),
		},
	];

	if (transaction.primary_pattern) {
		tags.push({
			id: `pattern-${slugify(transaction.primary_pattern)}`,
			name: titleize(transaction.primary_pattern),
		});
	}

	tags.push({
		id: `review-${transaction.review.status}`,
		name: reviewStatusLabel(transaction.review.status),
	});

	return tags;
}

function reasonDescription(transaction: MimirTransactionRisk) {
	const topReasons = transaction.reasons
		.slice(0, 4)
		.map((reason) => reason.message)
		.filter(Boolean);

	if (!topReasons.length) {
		return transaction.primary_pattern
			? titleize(transaction.primary_pattern)
			: null;
	}

	return topReasons.join(" ");
}

function scoreLabel(score: number) {
	return `${Math.round(score * 100)} risk`;
}

function reviewStatusLabel(status: string) {
	return titleize(status || "pending");
}

export function mapTransactionRisk(
	transaction: MimirTransactionRisk,
): MiddayLikeTransaction {
	const categorySlug = slugify(
		transaction.merchant_category || "uncategorized",
	);
	const workflowStatus = statusToWorkflowStatus(transaction.review.status);

	return {
		id: transaction.transaction_id,
		name: `${scoreLabel(transaction.risk_score)} · ${
			transaction.merchant_name || transaction.transaction_id
		}`,
		description: [
			`${transaction.transaction_id} · ${transaction.card_id} · ${reviewStatusLabel(transaction.review.status)}`,
			reasonDescription(transaction),
		]
			.filter(Boolean)
			.join(" · "),
		amount: transaction.amount,
		taxAmount: null,
		taxRate: null,
		taxType: null,
		currency: DEFAULT_CURRENCY,
		baseAmount: null,
		baseCurrency: DEFAULT_CURRENCY,
		counterpartyName: transaction.merchant_name,
		date: transaction.timestamp,
		category: {
			id: categorySlug,
			name: titleize(transaction.merchant_category || "Uncategorized"),
			color: CATEGORY_COLORS[transaction.risk_level] ?? DEFAULT_CATEGORY_COLOR,
			taxRate: null,
			taxType: null,
			slug: categorySlug,
		},
		status: workflowStatus,
		internal: false,
		recurring: false,
		manual: false,
		frequency: null,
		isFulfilled: transaction.is_flagged,
		isExported: transaction.review.status !== "pending",
		hasExportError: false,
		exportErrorCode: null,
		exportProvider: null,
		exportedAt: null,
		hasPendingSuggestion: false,
		note: transaction.reasons[0]?.message ?? null,
		enrichmentCompleted: true,
		method: transaction.channel || "card",
		account: {
			id: transaction.card_id,
			name: transaction.card_id,
			currency: DEFAULT_CURRENCY,
			connection: {
				id: "mimir-fraud",
				name: "Card baseline",
				logoUrl: null,
			},
		},
		assigned: null,
		tags: riskTags(transaction),
		attachments: [],
		riskScore: transaction.risk_score,
		riskLevel: transaction.risk_level,
		isFlagged: transaction.is_flagged,
		recommendedAction: transaction.recommended_action,
		primaryPattern: transaction.primary_pattern,
		componentScores: transaction.component_scores,
		reasons: transaction.reasons,
		reasonCount: transaction.reasons.length,
		reviewStatus: transaction.review.status,
		review: transaction.review,
		cardId: transaction.card_id,
		merchantName: transaction.merchant_name,
		merchantCategory: transaction.merchant_category,
		channel: transaction.channel,
		cardholderCountry: transaction.cardholder_country,
		merchantCountry: transaction.merchant_country,
		deviceId: transaction.device_id ?? null,
		ipAddress: transaction.ip_address ?? null,
		xfraudGraphScore: transaction.xfraud_graph_score ?? 0,
	};
}

function searchableTransactionText(transaction: MiddayLikeTransaction) {
	return [
		transaction.id,
		transaction.name,
		transaction.description,
		transaction.counterpartyName,
		transaction.primaryPattern,
		transaction.riskLevel,
		transaction.review.status,
		transaction.cardId,
		transaction.merchantName,
		transaction.merchantCategory,
		transaction.channel,
		transaction.cardholderCountry,
		transaction.merchantCountry,
		transaction.deviceId,
		transaction.ipAddress,
		...transaction.reasons.flatMap((reason) => [
			reason.code,
			reason.severity,
			reason.message,
			JSON.stringify(reason.evidence ?? {}),
		]),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
}

function signalText(transaction: MiddayLikeTransaction) {
	const componentSignals = Object.entries(transaction.componentScores)
		.filter(([, score]) => score >= 0.5)
		.map(([key]) => key);

	return [
		transaction.primaryPattern,
		...componentSignals,
		...transaction.reasons.flatMap((reason) => [reason.code, reason.message]),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
}

function sortValue(transaction: MiddayLikeTransaction, key: string) {
	switch (key) {
		case "amount":
			return transaction.amount;
		case "taxAmount":
			return transaction.riskScore;
		case "baseAmount":
			return transaction.reasonCount;
		case "baseTaxAmount":
			return transaction.xfraudGraphScore;
		case "risk_score":
		case "riskScore":
		case "score":
			return transaction.riskScore;
		case "risk_level":
		case "riskLevel":
			return { low: 1, medium: 2, high: 3, critical: 4 }[transaction.riskLevel];
		case "reason_count":
		case "reasonCount":
			return transaction.reasonCount;
		case "review_status":
		case "reviewStatus":
		case "status":
			return transaction.review.status;
		case "merchant_name":
		case "merchantName":
		case "counterparty":
		case "name":
		case "description":
			return transaction.merchantName;
		case "merchant_category":
		case "merchantCategory":
		case "category":
			return transaction.merchantCategory;
		case "card_id":
		case "cardId":
		case "bank_account":
		case "account":
			return transaction.cardId;
		case "channel":
		case "method":
			return transaction.channel;
		case "date":
		default:
			return new Date(transaction.date).getTime();
	}
}

function filterTransactions(
	transactions: MiddayLikeTransaction[],
	input: TransactionsQueryInput = {},
) {
	let result = [...transactions];

	if (isReviewQueueInput(input)) {
		result = result.filter(
			(transaction) =>
				transaction.isFlagged && transaction.review.status === "pending",
		);
	}

	if (input.q) {
		const query = input.q.toLowerCase();
		result = result.filter((transaction) =>
			searchableTransactionText(transaction).includes(query),
		);
	}

	if (input.risk_level?.length) {
		result = result.filter((transaction) =>
			input.risk_level?.includes(transaction.riskLevel),
		);
	}

	if (input.review_status?.length) {
		result = result.filter((transaction) =>
			input.review_status?.includes(transaction.review.status),
		);
	}

	result = result.filter(
		(transaction) =>
			matchesAny(transaction.cardId, input.card_id, { exact: true }) &&
			matchesAny(transaction.merchantName, input.merchant_name) &&
			matchesAny(transaction.merchantCategory, input.merchant_category, {
				slug: true,
			}) &&
			matchesAny(transaction.channel, input.channel, { exact: true }) &&
			matchesAny(transaction.cardholderCountry, input.cardholder_country, {
				exact: true,
			}) &&
			matchesAny(transaction.merchantCountry, input.merchant_country, {
				exact: true,
			}) &&
			matchesAny(transaction.deviceId, input.device_id, { exact: true }) &&
			matchesAny(transaction.ipAddress, input.ip_address, { exact: true }),
	);

	const signalValues = listify(input.signal).map(normalized).filter(Boolean);
	if (signalValues.length) {
		result = result.filter((transaction) => {
			const text = signalText(transaction);
			return signalValues.some((signal) => text.includes(signal));
		});
	}

	if (input.start) {
		const start = new Date(input.start).getTime();
		result = result.filter(
			(transaction) => new Date(transaction.date).getTime() >= start,
		);
	}

	if (input.end) {
		const end = new Date(input.end).getTime();
		result = result.filter(
			(transaction) => new Date(transaction.date).getTime() <= end,
		);
	}

	const amountRange = input.amountRange ?? input.amount_range;
	if (amountRange?.length === 2) {
		const [min, max] = amountRange;
		result = result.filter((transaction) => {
			const amount = Math.abs(transaction.amount);
			return amount >= Number(min) && amount <= Number(max);
		});
	}

	const scoreRange = normalizeScoreRange(input.score_range);
	if (scoreRange) {
		result = result.filter((transaction) =>
			matchesRange(transaction.riskScore, scoreRange),
		);
	}

	if (input.categories?.length) {
		const categories = new Set(
			input.categories.map((category) => normalized(category)),
		);
		result = result.filter(
			(transaction) =>
				(transaction.category?.slug &&
					categories.has(transaction.category.slug)) ||
				categories.has(slugify(transaction.merchantCategory)) ||
				(categories.has("uncategorized") && !transaction.category),
		);
	}

	if (input.accounts?.length) {
		const accounts = new Set(input.accounts);
		result = result.filter(
			(transaction) =>
				transaction.account?.id && accounts.has(transaction.account.id),
		);
	}

	if (input.tags?.length) {
		const tags = new Set(input.tags.map((tag) => normalized(tag)));
		result = result.filter((transaction) =>
			transaction.tags?.some(
				(tag) =>
					tags.has(normalized(tag.id)) ||
					(tag.name ? tags.has(slugify(tag.name)) : false),
			),
		);
	}

	if (input.statuses?.length) {
		const statuses = new Set(input.statuses);
		result = result.filter(
			(transaction) =>
				statuses.has(transaction.status) ||
				statuses.has(transaction.review.status),
		);
	}

	if (input.type === "income") {
		result = result.filter((transaction) => transaction.amount > 0);
	} else if (input.type === "expense") {
		result = result.filter((transaction) => transaction.amount < 0);
	}

	const [sortKey = "date", sortDirection = "desc"] = isReviewQueueInput(input)
		? ["risk_score", "desc"]
		: (input.sort ?? []);
	result.sort((a, b) => {
		const direction = sortDirection === "asc" ? 1 : -1;
		const left = sortValue(a, sortKey);
		const right = sortValue(b, sortKey);

		if (typeof left === "number" && typeof right === "number") {
			const comparison = left - right;
			if (comparison !== 0) {
				return comparison * direction;
			}
			return a.id.localeCompare(b.id);
		}

		const comparison = String(left ?? "").localeCompare(String(right ?? ""));
		return comparison === 0 ? a.id.localeCompare(b.id) : comparison * direction;
	});

	return result;
}

function paginateTransactions(
	transactions: MiddayLikeTransaction[],
	input: TransactionsQueryInput = {},
): PaginatedTransactions {
	const pageSize = input.pageSize ?? PAGE_SIZE;
	const offset = Number(input.cursor ?? 0);
	const data = transactions.slice(offset, offset + pageSize);
	const nextOffset = offset + pageSize;
	const hasNextPage = nextOffset < transactions.length;

	return {
		data,
		meta: {
			cursor: hasNextPage ? String(nextOffset) : undefined,
			hasPreviousPage: offset > 0,
			hasNextPage,
		},
	};
}

export async function fetchMimirSummary() {
	return requestJson<MimirSummary>("/summary");
}

export async function fetchMimirTransactions() {
	const transactions =
		await requestJson<MimirTransactionRisk[]>("/transactions");
	return transactions.map(mapTransactionRisk);
}

export async function fetchMimirQueue() {
	const transactions = await requestJson<MimirTransactionRisk[]>("/queue");
	return transactions.map(mapTransactionRisk);
}

export async function fetchMimirSyntheticLiveFeed(input: {
	cursor?: number;
	count?: number;
} = {}) {
	const params = new URLSearchParams();
	if (typeof input.cursor === "number") {
		params.set("cursor", String(input.cursor));
	}
	if (typeof input.count === "number") {
		params.set("count", String(input.count));
	}

	const query = params.toString();
	return requestJson<MimirSyntheticLiveFeed>(
		`/synthetic/live${query ? `?${query}` : ""}`,
	);
}

export async function fetchMimirTransactionContext(transactionId: string) {
	return requestJson<MimirTransactionContext>(
		`/transactions/${encodeURIComponent(transactionId)}/context`,
	);
}

export async function getTransactions(
	input: TransactionsQueryInput = {},
): Promise<PaginatedTransactions> {
	try {
		const source =
			input.fulfilled === true && input.exported === false
				? await fetchMimirQueue()
				: await fetchMimirTransactions();

		return paginateTransactions(filterTransactions(source, input), input);
	} catch (error) {
		console.warn("Unable to load Mimir transactions", error);
		return EMPTY_PAGINATED;
	}
}

export async function getTransactionById(input: { id: string }) {
	const transactions = await getTransactions({ pageSize: 10000 });
	return (
		transactions.data.find((transaction) => transaction.id === input.id) ?? null
	);
}

export async function getReviewCount() {
	try {
		const queue = await fetchMimirQueue();
		return queue.filter(
			(transaction) => transaction.review.status === "pending",
		).length;
	} catch (error) {
		console.warn("Unable to load Mimir review count", error);
		return 0;
	}
}

export async function getTransactionCategories() {
	const transactions = await fetchMimirTransactions();
	const categories = new Map<
		string,
		{
			id: string;
			name: string;
			slug: string;
			color: string;
			children: [];
		}
	>();

	for (const transaction of transactions) {
		const name = transaction.merchantCategory || "Uncategorized";
		const slug = slugify(name);
		if (!categories.has(slug)) {
			categories.set(slug, {
				id: slug,
				name: titleize(name),
				slug,
				color: CATEGORY_COLORS[transaction.riskLevel] ?? DEFAULT_CATEGORY_COLOR,
				children: [],
			});
		}
	}

	return [...categories.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getBankAccounts() {
	const transactions = await fetchMimirTransactions();
	const accounts = new Map<
		string,
		{
			id: string;
			name: string;
			currency: string;
			connection: { id: string; name: string; logoUrl: null };
		}
	>();

	for (const transaction of transactions) {
		if (!transaction.cardId || accounts.has(transaction.cardId)) {
			continue;
		}

		accounts.set(transaction.cardId, {
			id: transaction.cardId,
			name: transaction.cardId,
			currency: DEFAULT_CURRENCY,
			connection: {
				id: "mimir-fraud",
				name: "Mimir Fraud",
				logoUrl: null,
			},
		});
	}

	return [...accounts.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTags() {
	const transactions = await fetchMimirTransactions();
	const tags = new Map<string, { id: string; name: string }>();

	for (const transaction of transactions) {
		for (const tag of transaction.tags ?? []) {
			if (tag.name) {
				tags.set(tag.id, { id: tag.id, name: tag.name });
			}
		}
	}

	return [...tags.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSimilarTransactions(input: {
	transactionId?: string;
	name?: string;
	categorySlug?: string;
	frequency?: string;
}) {
	const transactions = await fetchMimirTransactions();
	const source = transactions.find(
		(transaction) => transaction.id === input.transactionId,
	);

	if (!source) {
		return [];
	}

	return transactions
		.filter((transaction) => transaction.id !== source.id)
		.filter((transaction) => {
			if (input.categorySlug) {
				return transaction.category?.slug === input.categorySlug;
			}

			if (input.frequency) {
				return (
					transaction.cardId === source.cardId &&
					transaction.merchantName === source.merchantName
				);
			}

			return (
				transaction.merchantName === source.merchantName ||
				transaction.cardId === source.cardId
			);
		})
		.slice(0, 25);
}

export async function getOverviewSummary(): Promise<OverviewSummary> {
	try {
		const [summary, queue, transactions] = await Promise.all([
			fetchMimirSummary(),
			fetchMimirQueue(),
			fetchMimirTransactions(),
		]);

		const flaggedExposure = queue.reduce(
			(total, transaction) => total + Math.abs(transaction.amount),
			0,
		);
		const criticalCount = summary.risk_level_counts.critical ?? 0;
		const reviewedCount = transactions.filter(
			(transaction) => transaction.review.status !== "pending",
		).length;
		const patternCount = Object.keys(
			summary.primary_pattern_counts ?? {},
		).length;

		return {
			openInvoices: {
				count: criticalCount,
				totalAmount: flaggedExposure,
				currency: DEFAULT_CURRENCY,
			},
			unbilledTime: {
				totalDuration: reviewedCount,
				totalAmount: flaggedExposure,
				projectCount: patternCount,
				currency: DEFAULT_CURRENCY,
			},
			inboxPending: {
				count: summary.flagged_rows,
			},
			transactionsToReview: {
				count: queue.filter(
					(transaction) => transaction.review.status === "pending",
				).length,
			},
			cashBalance: {
				totalBalance: transactions.reduce(
					(total, transaction) => total + Math.abs(transaction.amount),
					0,
				),
				currency: DEFAULT_CURRENCY,
				accountCount: new Set(
					transactions
						.map((transaction) => transaction.account?.id)
						.filter(Boolean),
				).size,
			},
			runway: patternCount,
		};
	} catch (error) {
		console.warn("Unable to load Mimir overview summary", error);
		return {
			openInvoices: { count: 0, totalAmount: 0, currency: DEFAULT_CURRENCY },
			unbilledTime: {
				totalDuration: 0,
				totalAmount: 0,
				projectCount: 0,
				currency: DEFAULT_CURRENCY,
			},
			inboxPending: { count: 0 },
			transactionsToReview: { count: 0 },
			cashBalance: {
				totalBalance: 0,
				currency: DEFAULT_CURRENCY,
				accountCount: 0,
			},
			runway: 0,
		};
	}
}

export async function globalSearch(input: { searchTerm?: string }) {
	const searchTerm = input.searchTerm?.trim().toLowerCase();

	if (!searchTerm) {
		return [];
	}

	const transactions = await getTransactions({
		q: searchTerm,
		pageSize: 20,
	});

	return transactions.data.map((transaction) => ({
		id: transaction.id,
		type: "transaction",
		title: `${transaction.id} · ${scoreLabel(transaction.riskScore)} · ${transaction.merchantName}`,
		data: {
			name: transaction.name,
			amount: transaction.amount,
			currency: transaction.currency,
			date: transaction.date,
			status: transaction.review.status,
			url: `/transactions?transactionId=${transaction.id}`,
		},
	}));
}

async function fetchMimirAudit() {
	try {
		return await requestJson<MimirAuditEvent[]>("/audit");
	} catch (error) {
		console.warn("Unable to load Mimir audit feed", error);
		return [];
	}
}

export async function getLiveNotifications(input?: {
	status?: string | string[];
	pageSize?: number;
}) {
	const [auditEvents, queue] = await Promise.all([
		fetchMimirAudit(),
		fetchMimirQueue().catch(() => []),
	]);

	const auditNotifications = auditEvents.map((event, index) => ({
		id: `audit-${event.transaction_id}-${event.created_at}-${index}`,
		type: "mimir_live_feed",
		status: "archived",
		createdAt: event.created_at,
		metadata: {
			recordId: event.transaction_id,
			message: `${titleize(event.action.replace(/^undo:/, "undo "))} ${event.transaction_id}`,
			transactionId: event.transaction_id,
			action: event.action,
			fromStatus: event.from_status,
			toStatus: event.to_status,
			reviewer: event.reviewer,
			note: event.note,
		},
	}));

	const queueNotifications = queue.slice(0, 8).map((transaction, index) => ({
		id: `queue-${transaction.id}`,
		type: "mimir_live_feed",
		status: index < 3 ? "unread" : "read",
		createdAt: transaction.date,
		metadata: {
			recordId: transaction.id,
			message: `${scoreLabel(transaction.riskScore)} · ${transaction.merchantName}`,
			transactionId: transaction.id,
			riskLevel: transaction.riskLevel,
			reason: transaction.reasons[0]?.message,
		},
	}));

	const wantedStatuses = new Set(listify(input?.status));
	const data = [...auditNotifications, ...queueNotifications]
		.filter((notification) =>
			wantedStatuses.size ? wantedStatuses.has(notification.status) : true,
		)
		.sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		)
		.slice(0, input?.pageSize ?? 20);

	return {
		data,
		meta: {
			cursor: null,
			hasPreviousPage: false,
			hasNextPage: false,
		},
	};
}

function reviewActionFromInput(input: {
	action?: MimirReviewerAction | string;
	status?: string;
}) {
	if (input.action) {
		return input.action;
	}

	switch (input.status) {
		case "exported":
			return "approve";
		case "excluded":
		case "archived":
			return "dismiss";
		default:
			return null;
	}
}

export async function applyReviewDecision(input: {
	id?: string;
	transactionId?: string;
	action?: MimirReviewerAction | string;
	status?: string;
	reviewer?: string;
	reviewerConfidence?: number;
	note?: string;
}) {
	const transactionId = input.transactionId ?? input.id;
	if (!transactionId) {
		return { success: false };
	}

	const action = reviewActionFromInput(input);
	if (!action) {
		return { success: true, id: transactionId };
	}

	return requestJson("/review", {
		method: "POST",
		body: JSON.stringify({
			transaction_id: transactionId,
			action,
			reviewer: input.reviewer ?? "dashboard_reviewer",
			reviewer_confidence: input.reviewerConfidence,
			note: input.note,
		}),
	});
}

export async function applyReviewDecisions(input: {
	ids?: string[];
	transactionIds?: string[];
	action?: MimirReviewerAction | string;
	status?: string;
	reviewer?: string;
	reviewerConfidence?: number;
	note?: string;
}) {
	const ids = input.transactionIds ?? input.ids ?? [];
	const results = [];

	for (const id of ids) {
		results.push(
			await applyReviewDecision({
				...input,
				transactionId: id,
			}),
		);
	}

	return {
		success: true,
		ids,
		results,
	};
}

export async function exportTransactions(input: { transactionIds?: string[] }) {
	const ids = input.transactionIds ?? [];

	if (ids.length) {
		await applyReviewDecisions({
			ids,
			action: "approve",
			note: "Exported from Mimir dashboard",
		});
	}

	return {
		id: `mimir-export-${Date.now()}`,
		transactionIds: ids,
	};
}

export function getJobStatus(input: { jobId?: string; count?: number }) {
	return {
		id: input.jobId,
		status: "completed",
		progress: 100,
		progressStep: "done",
		result: {
			successCount: input.count ?? 0,
			failedCount: 0,
		},
	};
}

export async function undoReviewDecision() {
	return requestJson("/undo", { method: "POST" });
}
