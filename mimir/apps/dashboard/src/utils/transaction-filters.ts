// Type for transaction filters based on the schema
export type TransactionFilters = {
	q?: string | null;
	risk_level?: ("low" | "medium" | "high" | "critical")[] | null;
	review_status?:
		| (
				| "pending"
				| "approved"
				| "dismissed"
				| "escalated"
				| "declined"
				| "blocked"
		  )[]
		| null;
	card_id?: string[] | null;
	merchant_name?: string[] | null;
	merchant_category?: string[] | null;
	channel?: string[] | null;
	cardholder_country?: string[] | null;
	merchant_country?: string[] | null;
	device_id?: string[] | null;
	ip_address?: string[] | null;
	start?: string | null;
	end?: string | null;
	amount_range?: number[] | null;
	score_range?: number[] | null;
	signal?: string[] | null;
	attachments?: "exclude" | "include" | null;
	categories?: string[] | null;
	tags?: string[] | null;
	accounts?: string[] | null;
	assignees?: string[] | null;
	amount?: string[] | null;
	recurring?: ("all" | "weekly" | "monthly" | "annually")[] | null;
	statuses?:
		| (
				| "blank"
				| "receipt_match"
				| "in_review"
				| "export_error"
				| "archived"
				| "excluded"
				| "exported"
		  )[]
		| null;
	manual?: "include" | "exclude" | null;
	/** Type filter: "income" for deposits/refunds, "expense" for purchases/charges */
	type?: "income" | "expense" | null;
};

// Generic filter state type
export type FilterState = Record<string, any>;

// Hook return type for consistency across all filter hooks
export type FilterHookReturn<T = FilterState> = {
	filter: T;
	setFilter: (filters: T) => void;
	hasFilters: boolean;
	clearAllFilters: () => void;
};

// Default empty filter state
export const EMPTY_FILTER_STATE: TransactionFilters = {
	q: null,
	risk_level: null,
	review_status: null,
	card_id: null,
	merchant_name: null,
	merchant_category: null,
	channel: null,
	cardholder_country: null,
	merchant_country: null,
	device_id: null,
	ip_address: null,
	start: null,
	end: null,
	amount_range: null,
	score_range: null,
	signal: null,
	attachments: null,
	categories: null,
	tags: null,
	accounts: null,
	assignees: null,
	amount: null,
	recurring: null,
	statuses: null,
	manual: null,
	type: null,
};

/**
 * Check if a single filter value is active (has meaningful content)
 */
export function isFilterValueActive(value: any): boolean {
	if (value === null || value === undefined || value === "") return false;
	if (Array.isArray(value)) return value.length > 0;
	return true;
}

/**
 * Check if a filter object has any active filters
 */
export function hasActiveFilters(filters: Record<string, any>): boolean {
	return Object.values(filters).some(isFilterValueActive);
}

/**
 * Clean filters by removing null/undefined/empty values
 */
export function cleanFilters(
	filters: Record<string, any>,
): Record<string, any> {
	return Object.fromEntries(
		Object.entries(filters).filter(([_, value]) => isFilterValueActive(value)),
	);
}

/**
 * Compare two filter objects for equality
 */
export function areFiltersEqual(
	filters1: Record<string, any>,
	filters2: Record<string, any>,
): boolean {
	const normalize = (filters: Record<string, any>) => {
		const cleaned = cleanFilters(filters);
		return JSON.stringify(cleaned, Object.keys(cleaned).sort());
	};

	return normalize(filters1) === normalize(filters2);
}

/**
 * Check if URL params contain any active filters
 */
export function hasActiveUrlFilters(urlFilters: Record<string, any>): boolean {
	return hasActiveFilters(urlFilters);
}

/**
 * Create an empty filter state for any entity
 */
export function createEmptyFilterState<T extends Record<string, any>>(
	keys: (keyof T)[],
): T {
	return keys.reduce((acc, key) => {
		(acc as any)[key] = null;
		return acc;
	}, {} as T);
}
