import { Badge } from "@midday/ui/badge";
import { Progress } from "@midday/ui/progress";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@midday/ui/table";
import type { Metadata } from "next";
import { getTransactions } from "@/lib/mimir/client";
import {
	formatMoney,
	riskClass,
	scorePercent,
	titleize,
	topReason,
} from "@/lib/mimir/dashboard";
import type { MiddayLikeTransaction } from "@/lib/mimir/types";

export const metadata: Metadata = {
	title: "Merchant Categories | Mimir",
};

function RiskBadge({ level }: { level?: string }) {
	return (
		<Badge
			variant="outline"
			className={`px-2 py-0.5 text-[11px] capitalize ${riskClass(level)}`}
		>
			{level ?? "low"}
		</Badge>
	);
}

function categoryRows(transactions: MiddayLikeTransaction[]) {
	const groups = new Map<string, MiddayLikeTransaction[]>();

	for (const transaction of transactions) {
		const key = transaction.merchantCategory || "uncategorized";
		groups.set(key, [...(groups.get(key) ?? []), transaction]);
	}

	return [...groups.entries()]
		.map(([category, rows]) => {
			const flagged = rows.filter((row) => row.isFlagged);
			const riskiest = [...rows].sort(
				(left, right) => right.riskScore - left.riskScore,
			)[0];

			return {
				category,
				label: titleize(category),
				count: rows.length,
				flaggedCount: flagged.length,
				exposure: flagged.reduce(
					(total, row) => total + Math.abs(row.amount),
					0,
				),
				maxRisk: riskiest?.riskScore ?? 0,
				riskLevel: riskiest?.riskLevel ?? "low",
				reason: riskiest ? topReason(riskiest) : "No risk signal",
			};
		})
		.sort((left, right) => {
			const flaggedDelta = right.flaggedCount - left.flaggedCount;
			if (flaggedDelta !== 0) return flaggedDelta;
			return right.maxRisk - left.maxRisk;
		});
}

export default async function MerchantCategoriesPage() {
	const transactionsPage = await getTransactions({
		pageSize: 10000,
		sort: ["risk_score", "desc"],
	}).catch(() => ({ data: [] }));
	const rows = categoryRows(transactionsPage.data);
	const maxFlagged = Math.max(...rows.map((row) => row.flaggedCount), 1);

	return (
		<div className="max-w-screen-lg">
			<div className="mb-6">
				<h2 className="text-lg font-medium leading-none tracking-tight mb-2">
					Merchant categories
				</h2>
				<p className="text-sm text-muted-foreground">
					Category maintenance is backed by Mimir risk data instead of finance
					bookkeeping.
				</p>
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Category</TableHead>
						<TableHead>Flag pressure</TableHead>
						<TableHead className="text-right">Exposure</TableHead>
						<TableHead className="text-right">Max risk</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TableRow key={row.category}>
							<TableCell>
								<div className="font-medium">{row.label}</div>
								<div className="mt-1 truncate text-xs text-muted-foreground">
									{row.reason}
								</div>
							</TableCell>
							<TableCell>
								<div className="flex items-center justify-between gap-3">
									<Progress
										value={Math.max(
											(row.flaggedCount / maxFlagged) * 100,
											row.flaggedCount > 0 ? 5 : 0,
										)}
										className="h-1.5 bg-muted [&>div]:bg-foreground/70"
									/>
									<span className="w-16 text-right font-mono text-xs text-muted-foreground">
										{row.flaggedCount}/{row.count}
									</span>
								</div>
							</TableCell>
							<TableCell className="text-right">
								{formatMoney(row.exposure)}
							</TableCell>
							<TableCell className="text-right">
								<div className="flex items-center justify-end gap-2">
									<span className="font-mono text-sm">
										{scorePercent(row.maxRisk)}
									</span>
									<RiskBadge level={row.riskLevel} />
								</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
