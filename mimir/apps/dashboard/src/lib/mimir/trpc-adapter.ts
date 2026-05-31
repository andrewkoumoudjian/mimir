import {
	applyReviewDecision,
	applyReviewDecisions,
	EMPTY_PAGINATED,
	exportTransactions,
	getBankAccounts,
	getJobStatus,
	getLiveNotifications,
	getOverviewSummary,
	getReviewCount,
	getSimilarTransactions,
	getTags,
	getTransactionById,
	getTransactionCategories,
	getTransactions,
	globalSearch,
	MIMIR_TEAM,
	MIMIR_USER,
	undoReviewDecision,
} from "./client";

type ProcedurePath = string[];
type QueryOptions = Record<string, unknown>;

const EMPTY_TIMER_STATUS = {
	isRunning: false,
	elapsedTime: 0,
	currentEntry: null,
};

const EMPTY_INVOICE_DEFAULTS = {
	customerId: null,
	fromDetails: null,
	paymentDetails: null,
	noteDetails: null,
	template: null,
	currency: "USD",
};

function routeName(path: ProcedurePath) {
	return path.join(".");
}

function queryKey(path: ProcedurePath, input?: unknown, type?: string) {
	return [["mimir", ...path], { input, type }];
}

function isInfinitePath(path: string) {
	return (
		path.endsWith(".get") || path.endsWith(".list") || path.includes("orders")
	);
}

function emptyPaginated() {
	return { ...EMPTY_PAGINATED, data: [] };
}

function defaultQueryResult(path: string) {
	if (path === "user.me") {
		return MIMIR_USER;
	}

	if (path === "team.current") {
		return MIMIR_TEAM;
	}

	if (path === "team.members") {
		return [
			{
				user: {
					id: MIMIR_USER.id,
					fullName: MIMIR_USER.fullName,
					avatarUrl: MIMIR_USER.avatarUrl,
					email: MIMIR_USER.email,
				},
				role: "owner",
			},
		];
	}

	if (path === "team.list") {
		return [MIMIR_TEAM];
	}

	if (path === "team.connectionStatus") {
		return {
			bankConnections: [],
			inboxAccounts: [],
		};
	}

	if (path === "trackerEntries.getTimerStatus") {
		return EMPTY_TIMER_STATUS;
	}

	if (path === "invoice.defaultSettings") {
		return EMPTY_INVOICE_DEFAULTS;
	}

	if (
		path.endsWith(".get") ||
		path.endsWith(".list") ||
		path.endsWith(".authorized") ||
		path.endsWith(".connections") ||
		path.endsWith(".currencies") ||
		path.endsWith(".invites") ||
		path.endsWith(".teamInvites") ||
		path.endsWith(".invitesByEmail")
	) {
		return [];
	}

	if (path.includes("invoiceSummary") || path.includes("paymentStatus")) {
		return {
			invoiceCount: 0,
			totalAmount: 0,
			currency: "USD",
			paid: 0,
			unpaid: 0,
			overdue: 0,
		};
	}

	if (path.includes("Status") || path.includes("status")) {
		return { status: "idle", isRunning: false };
	}

	return null;
}

async function callQuery(path: ProcedurePath, input?: any) {
	const name = routeName(path);

	switch (name) {
		case "overview.summary":
			return getOverviewSummary();
		case "transactions.get":
			return getTransactions(input);
		case "transactions.getById":
			return getTransactionById(input);
		case "transactions.getReviewCount":
			return getReviewCount();
		case "transactions.getSimilarTransactions":
			return getSimilarTransactions(input ?? {});
		case "transactionCategories.get":
			return getTransactionCategories();
		case "bankAccounts.get":
			return getBankAccounts();
		case "tags.get":
			return getTags();
		case "jobs.getStatus":
			return getJobStatus(input ?? {});
		case "search.global":
			return globalSearch(input ?? {});
		case "notifications.list":
			return getLiveNotifications(input ?? {});
		default:
			return defaultQueryResult(name);
	}
}

async function callInfiniteQuery(
	path: ProcedurePath,
	input?: any,
	pageParam?: any,
) {
	const name = routeName(path);

	if (name === "transactions.get") {
		return getTransactions({
			...(input ?? {}),
			cursor: pageParam ?? input?.cursor ?? null,
		});
	}

	if (isInfinitePath(name)) {
		return emptyPaginated();
	}

	return callQuery(path, input);
}

async function callMutation(path: ProcedurePath, input?: any) {
	const name = routeName(path);

	switch (name) {
		case "transactions.update":
			if (!input?.action && !input?.status) {
				return { success: true, id: input?.id };
			}
			return applyReviewDecision(input ?? {});
		case "transactions.updateMany":
			if (!input?.action && !input?.status) {
				return { success: true, ids: input?.ids ?? [] };
			}
			return applyReviewDecisions(input ?? {});
		case "transactions.moveToReview":
			return applyReviewDecision({ ...(input ?? {}), action: "escalate" });
		case "transactions.export":
			return exportTransactions(input ?? {});
		case "transactions.deleteMany":
			return { success: true, ids: input ?? [] };
		case "review.undo":
			return undoReviewDecision();
		case "notifications.updateStatus":
		case "notifications.updateAllStatus":
			return { success: true };
		case "user.update":
			return { ...MIMIR_USER, ...(input ?? {}) };
		case "team.update":
			return { ...MIMIR_TEAM, ...(input ?? {}) };
		default:
			return { success: true };
	}
}

function normalizeQueryArgs(inputOrOptions?: any, maybeOptions?: any) {
	if (maybeOptions !== undefined) {
		return { input: inputOrOptions, options: maybeOptions };
	}

	return { input: inputOrOptions, options: undefined };
}

function createProcedureProxy(path: ProcedurePath): any {
	return new Proxy(() => undefined, {
		get(_target, prop) {
			if (typeof prop !== "string") {
				return undefined;
			}

			if (prop === "then") {
				return undefined;
			}

			if (prop === "queryKey") {
				return (input?: unknown) => queryKey(path, input);
			}

			if (prop === "infiniteQueryKey") {
				return (input?: unknown) => queryKey(path, input, "infinite");
			}

			if (prop === "mutationKey") {
				return (input?: unknown) => queryKey(path, input, "mutation");
			}

			if (prop === "query") {
				return (input?: unknown) => callQuery(path, input);
			}

			if (prop === "mutate") {
				return (input?: unknown) => callMutation(path, input);
			}

			if (prop === "queryOptions") {
				return (inputOrOptions?: unknown, maybeOptions?: QueryOptions) => {
					const { input, options } = normalizeQueryArgs(
						inputOrOptions,
						maybeOptions,
					);

					return {
						queryKey: queryKey(path, input),
						queryFn: () => callQuery(path, input),
						...(options ?? {}),
					};
				};
			}

			if (prop === "infiniteQueryOptions") {
				return (inputOrOptions?: unknown, maybeOptions?: QueryOptions) => {
					const { input, options } = normalizeQueryArgs(
						inputOrOptions,
						maybeOptions,
					);

					return {
						queryKey: queryKey(path, input, "infinite"),
						initialPageParam: (input as any)?.cursor ?? null,
						queryFn: ({ pageParam }: { pageParam?: unknown }) =>
							callInfiniteQuery(path, input, pageParam),
						...(options ?? {}),
					};
				};
			}

			if (prop === "mutationOptions") {
				return (options?: QueryOptions) => ({
					mutationKey: queryKey(path, undefined, "mutation"),
					mutationFn: (input: unknown) => callMutation(path, input),
					...(options ?? {}),
				});
			}

			return createProcedureProxy([...path, prop]);
		},
	});
}

export function createMimirTRPCProxy() {
	return createProcedureProxy([]);
}
