import type {
	MIMIR_TEAM,
	MIMIR_USER,
} from "../../../../apps/dashboard/src/lib/mimir/client";
import type {
	MiddayLikeTransaction,
	PaginatedTransactions,
} from "../../../../apps/dashboard/src/lib/mimir/types";

export type AppRouter = any;

export type RouterOutputs = Record<string, any> & {
	overview: {
		summary: any;
	};
	transactions: {
		get: PaginatedTransactions;
		getById: MiddayLikeTransaction | null;
		getReviewCount: number;
		getSimilarTransactions: MiddayLikeTransaction[];
	};
	user: {
		me: typeof MIMIR_USER;
	};
	team: {
		current: typeof MIMIR_TEAM;
		members: Array<{
			user: {
				id: string;
				fullName: string | null;
				avatarUrl: string | null;
				email?: string | null;
			} | null;
			role?: string | null;
		}>;
	};
};

export type RouterInputs = Record<string, any>;
