import { useQueryStates } from "nuqs";
import {
	createLoader,
	parseAsArrayOf,
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
} from "nuqs/server";

export const transactionFilterParamsSchema = {
	q: parseAsString,
	risk_level: parseAsArrayOf(
		parseAsStringLiteral(["low", "medium", "high", "critical"] as const),
	),
	review_status: parseAsArrayOf(
		parseAsStringLiteral([
			"pending",
			"approved",
			"dismissed",
			"escalated",
			"declined",
			"blocked",
		] as const),
	),
	card_id: parseAsArrayOf(parseAsString),
	merchant_name: parseAsArrayOf(parseAsString),
	merchant_category: parseAsArrayOf(parseAsString),
	channel: parseAsArrayOf(parseAsString),
	cardholder_country: parseAsArrayOf(parseAsString),
	merchant_country: parseAsArrayOf(parseAsString),
	device_id: parseAsArrayOf(parseAsString),
	ip_address: parseAsArrayOf(parseAsString),
	start: parseAsString,
	end: parseAsString,
	amount_range: parseAsArrayOf(parseAsInteger),
	score_range: parseAsArrayOf(parseAsInteger),
	signal: parseAsArrayOf(parseAsString),
	attachments: parseAsStringLiteral(["exclude", "include"] as const),
	categories: parseAsArrayOf(parseAsString),
	tags: parseAsArrayOf(parseAsString),
	accounts: parseAsArrayOf(parseAsString),
	assignees: parseAsArrayOf(parseAsString),
	amount: parseAsArrayOf(parseAsString),
	recurring: parseAsArrayOf(
		parseAsStringLiteral(["all", "weekly", "monthly", "annually"] as const),
	),
	statuses: parseAsArrayOf(
		parseAsStringLiteral([
			"blank",
			"receipt_match",
			"in_review",
			"export_error",
			"archived",
			"excluded",
			"exported",
		] as const),
	),
	manual: parseAsStringLiteral(["exclude", "include"] as const),
	type: parseAsStringLiteral(["income", "expense"] as const),
};

export function useTransactionFilterParams() {
	const [filter, setFilter] = useQueryStates(transactionFilterParamsSchema, {
		// Clear URL when values are null/default
		clearOnDefault: true,
	});

	return {
		filter,
		setFilter,
		hasFilters: Object.values(filter).some((value) => value !== null),
	};
}

export const loadTransactionFilterParams = createLoader(
	transactionFilterParamsSchema,
);
