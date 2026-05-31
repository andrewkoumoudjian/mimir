export type MimirRiskLevel = "low" | "medium" | "high" | "critical";
export type MimirReviewStatus =
	| "pending"
	| "approved"
	| "dismissed"
	| "escalated"
	| "declined"
	| "blocked";
export type MimirReviewerAction =
	| "approve"
	| "dismiss"
	| "escalate"
	| "decline"
	| "block";

export type MimirReason = {
	code: string;
	severity: MimirRiskLevel;
	message: string;
	evidence?: Record<string, unknown>;
	priority?: number;
};

export type MimirComponentScores = {
	card_baseline: number;
	categorical_surprisal: number;
	temporal_velocity: number;
	graph_collective: number;
	model_consensus: number;
};

export type MimirReviewHistoryEvent = {
	transaction_id: string;
	action: string;
	from_status: MimirReviewStatus;
	to_status: MimirReviewStatus;
	reviewer: string;
	reviewer_confidence?: number | null;
	note?: string | null;
	created_at: string;
};

export type MimirTransactionReview = {
	status: MimirReviewStatus;
	history: MimirReviewHistoryEvent[];
};

export type MimirTransactionRisk = {
	transaction_id: string;
	timestamp: string;
	card_id: string;
	amount: number;
	merchant_name: string;
	merchant_category: string;
	channel: string;
	cardholder_country: string;
	merchant_country: string;
	device_id?: string | null;
	ip_address?: string | null;
	xfraud_graph_score?: number;
	risk_score: number;
	risk_level: MimirRiskLevel;
	is_flagged: boolean;
	recommended_action: "monitor" | "review" | "escalate";
	primary_pattern: string;
	component_scores: MimirComponentScores;
	reasons: MimirReason[];
	model_version: string;
	review: MimirTransactionReview;
};

export type MimirSyntheticLiveEvent = MimirTransactionRisk & {
	arrival_index: number;
	received_at: string;
	source: string;
	raw_transaction: Record<string, unknown>;
};

export type MimirSyntheticLiveFeed = {
	source: string;
	cursor: number;
	next_cursor: number;
	requested_count: number;
	count: number;
	generated_total: number;
	profile?: Record<string, unknown>;
	diagnostics?: {
		processed_rows: number;
		flagged_rows: number;
		threshold: number;
		model_version: string;
	};
	events: MimirSyntheticLiveEvent[];
};

export type MimirSummary = {
	processed_rows: number;
	flagged_rows: number;
	review_rate: number;
	threshold: number;
	profile: string;
	model_version: string;
	risk_level_counts: Record<string, number>;
	primary_pattern_counts: Record<string, number>;
	primitive_status?: Record<string, unknown>;
	output_files?: Record<string, string>;
};

export type MimirTransactionContext = {
	transaction: Record<string, unknown>;
	links: Array<Record<string, unknown>>;
	card_timeline: Array<Record<string, unknown>>;
	related_transactions: Record<string, Array<Record<string, unknown>>>;
	graph: {
		nodes: Array<Record<string, unknown>>;
		edges: Array<Record<string, unknown>>;
	};
};

export type MiddayLikeTransaction = {
	id: string;
	name: string;
	description: string | null;
	amount: number;
	taxAmount: number | null;
	taxRate: number | null;
	taxType: string | null;
	currency: string;
	baseAmount: number | null;
	baseCurrency: string | null;
	counterpartyName: string | null;
	date: string;
	category: {
		id: string;
		name: string;
		color: string;
		taxRate: number | null;
		taxType: string | null;
		slug: string;
	} | null;
	status: string;
	internal: boolean | null;
	recurring: boolean | null;
	manual: boolean | null;
	frequency: string | null;
	isFulfilled: boolean;
	isExported: boolean;
	hasExportError: boolean;
	exportErrorCode: string | null;
	exportProvider: string | null;
	exportedAt: string | null;
	hasPendingSuggestion: boolean;
	note: string | null;
	enrichmentCompleted: boolean;
	method: string;
	account: {
		id: string;
		name: string | null;
		currency: string | null;
		connection: {
			id: string;
			name: string;
			logoUrl: string | null;
		} | null;
	} | null;
	assigned: {
		id: string;
		fullName: string | null;
		avatarUrl: string | null;
	} | null;
	tags: Array<{ id: string; name: string | null }> | null;
	attachments: Array<{
		id: string;
		path: string[];
		size: number;
		type: string;
		filename: string | null;
	}> | null;
	riskScore: number;
	riskLevel: MimirRiskLevel;
	isFlagged: boolean;
	recommendedAction: string;
	primaryPattern: string;
	componentScores: MimirComponentScores;
	reasons: MimirReason[];
	reasonCount: number;
	reviewStatus: MimirReviewStatus;
	review: MimirTransactionReview;
	cardId: string;
	merchantName: string;
	merchantCategory: string;
	channel: string;
	cardholderCountry: string;
	merchantCountry: string;
	deviceId: string | null;
	ipAddress: string | null;
	xfraudGraphScore: number;
};

export type TransactionsQueryInput = {
	cursor?: string | null;
	sort?: string[] | null;
	pageSize?: number;
	q?: string | null;
	categories?: string[] | null;
	tags?: string[] | null;
	start?: string | null;
	end?: string | null;
	accounts?: string[] | null;
	assignees?: string[] | null;
	statuses?: string[] | null;
	risk_level?: MimirRiskLevel[] | null;
	review_status?: MimirReviewStatus[] | null;
	card_id?: string[] | string | null;
	merchant_name?: string[] | string | null;
	merchant_category?: string[] | string | null;
	channel?: string[] | string | null;
	cardholder_country?: string[] | string | null;
	merchant_country?: string[] | string | null;
	device_id?: string[] | string | null;
	ip_address?: string[] | string | null;
	amount_range?: number[] | null;
	score_range?: number[] | null;
	signal?: string[] | string | null;
	recurring?: string[] | null;
	attachments?: "include" | "exclude" | null;
	amountRange?: number[] | null;
	amount?: string[] | null;
	type?: "income" | "expense" | null;
	manual?: "include" | "exclude" | null;
	exported?: boolean | null;
	fulfilled?: boolean | null;
};

export type PaginatedTransactions = {
	data: MiddayLikeTransaction[];
	meta: {
		cursor?: string;
		hasPreviousPage: boolean;
		hasNextPage: boolean;
	};
};
