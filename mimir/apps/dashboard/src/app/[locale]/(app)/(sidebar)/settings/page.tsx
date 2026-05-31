import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@midday/ui/card";
import { Progress } from "@midday/ui/progress";
import type { Metadata } from "next";
import { fetchMimirSummary, getTransactions } from "@/lib/mimir/client";
import {
	EMPTY_SUMMARY,
	formatMoney,
	formatPercent,
	reviewStats,
} from "@/lib/mimir/dashboard";
import type { MimirSummary } from "@/lib/mimir/types";

export const metadata: Metadata = {
	title: "Detection Controls | Mimir",
};

async function safeSummary(): Promise<MimirSummary> {
	try {
		return await fetchMimirSummary();
	} catch {
		return EMPTY_SUMMARY;
	}
}

export default async function DetectionControlsPage() {
	const [summary, transactionsPage] = await Promise.all([
		safeSummary(),
		getTransactions({ pageSize: 10000 }).catch(() => ({ data: [] })),
	]);
	const stats = reviewStats(transactionsPage.data);
	const reviewed =
		stats.flagged > 0 ? Math.round((stats.reviewed / stats.flagged) * 100) : 0;
	const threshold = Math.round(summary.threshold * 100);

	return (
		<div className="space-y-12">
			<Card>
				<CardHeader>
					<CardTitle>Detection controls</CardTitle>
					<CardDescription>
						Configure the operating posture for the fraud review desk. The
						dashboard reads the active threshold and review rate from the Mimir
						scoring API.
					</CardDescription>
				</CardHeader>

				<CardContent className="space-y-6">
					<div>
						<div className="mb-2 flex items-center justify-between text-sm">
							<span>Risk threshold</span>
							<span className="font-mono">{threshold}</span>
						</div>
						<Progress
							value={threshold}
							className="h-2 bg-muted [&>div]:bg-foreground/70"
						/>
					</div>

					<div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
						<div>
							<div className="text-muted-foreground">Review rate</div>
							<div className="mt-1 font-medium">
								{formatPercent(summary.review_rate)}
							</div>
						</div>
						<div>
							<div className="text-muted-foreground">Pending flags</div>
							<div className="mt-1 font-medium">{stats.pending}</div>
						</div>
						<div>
							<div className="text-muted-foreground">Flagged exposure</div>
							<div className="mt-1 font-medium">
								{formatMoney(stats.exposure)}
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Review completion</CardTitle>
					<CardDescription>
						Export readiness depends on clearing the flagged queue with approve,
						dismiss, escalate, and undo receipts.
					</CardDescription>
				</CardHeader>

				<CardContent>
					<div className="mb-2 flex items-center justify-between text-sm">
						<span>Reviewed flags</span>
						<span className="font-mono">{reviewed}%</span>
					</div>
					<Progress
						value={reviewed}
						className="h-2 bg-muted [&>div]:bg-foreground/70"
					/>
				</CardContent>
			</Card>
		</div>
	);
}
