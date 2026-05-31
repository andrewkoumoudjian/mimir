import { Badge } from "@midday/ui/badge";
import { Button } from "@midday/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@midday/ui/card";
import { Progress } from "@midday/ui/progress";
import { Separator } from "@midday/ui/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@midday/ui/table";
import type { Metadata } from "next";
import Link from "next/link";
import { fetchMimirSummary, getTransactions } from "@/lib/mimir/client";
import {
	buildEntityClusters,
	componentSignalRows,
	EMPTY_SUMMARY,
	formatPercent,
	patternCounts,
	riskClass,
	riskCounts,
	scorePercent,
	titleize,
} from "@/lib/mimir/dashboard";
import type { MimirRiskLevel, MimirSummary } from "@/lib/mimir/types";

export const metadata: Metadata = {
	title: "Fraud Patterns | Mimir",
};

async function safeSummary(): Promise<MimirSummary> {
	try {
		return await fetchMimirSummary();
	} catch {
		return EMPTY_SUMMARY;
	}
}

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

function MetricCard({
	label,
	value,
	detail,
}: {
	label: string;
	value: string;
	detail: string;
}) {
	return (
		<Card className="border-border bg-background">
			<CardHeader className="pb-3">
				<CardDescription className="text-xs text-muted-foreground">
					{label}
				</CardDescription>
				<CardTitle className="text-2xl font-medium text-foreground">
					{value}
				</CardTitle>
			</CardHeader>
			<CardContent className="pt-0 text-xs leading-5 text-muted-foreground">
				{detail}
			</CardContent>
		</Card>
	);
}

export default async function PatternsPage() {
	const [summary, transactionsPage] = await Promise.all([
		safeSummary(),
		getTransactions({ pageSize: 10000, sort: ["risk_score", "desc"] }),
	]);
	const transactions = transactionsPage.data;
	const processedRows = summary.processed_rows || transactions.length;
	const counts = riskCounts(summary, transactions);
	const patterns = patternCounts(summary, transactions).slice(0, 8);
	const signals = componentSignalRows(transactions);
	const clusters = buildEntityClusters(transactions).slice(0, 6);
	const flaggedRows =
		summary.flagged_rows ||
		transactions.filter((transaction) => transaction.isFlagged).length;
	const maxPatternCount = Math.max(
		...patterns.map((pattern) => pattern.count),
		1,
	);
	const criticalAndHigh = counts.critical + counts.high;
	const levels: MimirRiskLevel[] = ["critical", "high", "medium", "low"];

	return (
		<main className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 py-6 text-foreground">
			<header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
				<div>
					<p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
						Pattern Lab
					</p>
					<h1 className="mt-2 text-2xl font-medium">Fraud signal coverage</h1>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
						Use this page to defend the detector: per-card anomaly scoring,
						cross-card aggregation, explainable reasons, and cost-aware tuning.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button asChild variant="outline" size="sm">
						<Link href="/transactions?tab=review">Open queue</Link>
					</Button>
					<Button asChild variant="outline" size="sm">
						<Link href="/inbox">Live feed</Link>
					</Button>
				</div>
			</header>

			<section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
				<MetricCard
					label="Rows processed"
					value={processedRows.toLocaleString("en-CA")}
					detail="The command center expects all 1,000 challenge transactions to be ingested before review."
				/>
				<MetricCard
					label="Flagged for review"
					value={flaggedRows.toLocaleString("en-CA")}
					detail={`${formatPercent(summary.review_rate)} review rate at threshold ${scorePercent(summary.threshold)}.`}
				/>
				<MetricCard
					label="High-pressure flags"
					value={criticalAndHigh.toLocaleString("en-CA")}
					detail="Critical and high levels are the first pass for a seven-minute demo."
				/>
				<MetricCard
					label="Active patterns"
					value={patterns.length.toLocaleString("en-CA")}
					detail={`Model ${summary.model_version} running in ${summary.profile} mode.`}
				/>
			</section>

			<section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
				<Card className="border-border bg-background">
					<CardHeader>
						<CardTitle className="text-base">Primary fraud patterns</CardTitle>
						<CardDescription className="text-xs text-muted-foreground">
							Patterns are ranked by flagged volume and link back into the
							transaction reviewer.
						</CardDescription>
					</CardHeader>
					<Separator />
					<CardContent className="p-0">
						<Table>
							<TableHeader>
								<TableRow className="border-border">
									<TableHead>Pattern</TableHead>
									<TableHead className="w-[180px]">Coverage</TableHead>
									<TableHead className="text-right">Flags</TableHead>
									<TableHead className="text-right">Review</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{patterns.map((pattern) => (
									<TableRow key={pattern.pattern} className="border-border">
										<TableCell className="font-medium text-foreground">
											{pattern.label}
										</TableCell>
										<TableCell>
											<Progress
												value={Math.max(
													(pattern.count / maxPatternCount) * 100,
													4,
												)}
												className="h-1.5 bg-muted [&>div]:bg-foreground/70"
											/>
										</TableCell>
										<TableCell className="text-right font-mono text-xs text-muted-foreground">
											{pattern.count}
										</TableCell>
										<TableCell className="text-right">
											<Button asChild variant="link" size="sm">
												<Link
													href={`/transactions?tab=review&signal=${encodeURIComponent(pattern.pattern)}`}
												>
													Open
												</Link>
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>

				<Card className="border-border bg-background">
					<CardHeader>
						<CardTitle className="text-base">Risk distribution</CardTitle>
						<CardDescription className="text-xs text-muted-foreground">
							The distribution makes over-flagging visible before export.
						</CardDescription>
					</CardHeader>
					<Separator />
					<CardContent className="flex flex-col gap-3 p-4">
						{levels.map((level) => {
							const count = counts[level] ?? 0;
							const value =
								count > 0 && processedRows > 0
									? Math.max((count / processedRows) * 100, 2)
									: 0;

							return (
								<div
									key={level}
									className="grid grid-cols-[74px_1fr_46px] items-center gap-3"
								>
									<div className="text-xs capitalize text-muted-foreground">
										{level}
									</div>
									<Progress
										value={value}
										className={
											level === "critical" || level === "high"
												? "h-2 bg-muted [&>div]:bg-destructive/70"
												: "h-2 bg-muted [&>div]:bg-muted-foreground"
										}
									/>
									<div className="text-right font-mono text-xs text-muted-foreground">
										{count}
									</div>
								</div>
							);
						})}
					</CardContent>
				</Card>
			</section>

			<section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
				<Card className="border-border bg-background">
					<CardHeader>
						<CardTitle className="text-base">Detector signal mix</CardTitle>
						<CardDescription className="text-xs text-muted-foreground">
							Every flag should be explainable by at least one human-readable
							signal.
						</CardDescription>
					</CardHeader>
					{signals.map((signal) => (
						<CardContent
							key={signal.key}
							className="border-t border-border px-4 py-3"
						>
							<div className="flex items-center justify-between gap-4">
								<div>
									<div className="text-sm font-medium text-foreground">
										{signal.label}
									</div>
									<div className="mt-1 text-xs text-muted-foreground">
										{signal.active} transactions above signal threshold
									</div>
								</div>
								<div className="font-mono text-sm text-muted-foreground">
									{scorePercent(signal.average)}
								</div>
							</div>
							<Progress
								value={scorePercent(signal.average)}
								className="mt-3 h-1.5 bg-muted [&>div]:bg-foreground/70"
							/>
						</CardContent>
					))}
				</Card>

				<Card className="border-border bg-background">
					<CardHeader>
						<CardTitle className="text-base">Cross-card clusters</CardTitle>
						<CardDescription className="text-xs text-muted-foreground">
							Shared devices, IPs, and merchants expose patterns a single-card
							baseline cannot see.
						</CardDescription>
					</CardHeader>
					{clusters.map((cluster) => (
						<CardContent
							key={`${cluster.kind}-${cluster.id}`}
							className="border-t border-border px-4 py-3"
						>
							<div className="flex items-start justify-between gap-4">
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<span className="truncate text-sm font-medium text-foreground">
											{cluster.id}
										</span>
										<RiskBadge level={cluster.riskLevel} />
									</div>
									<div className="mt-1 text-xs text-muted-foreground">
										{titleize(cluster.kind)} across {cluster.cardCount} cards,{" "}
										{cluster.flaggedCount} flagged
									</div>
									<div className="mt-1 truncate text-xs text-muted-foreground">
										{cluster.reason}
									</div>
								</div>
								<Button asChild variant="link" size="sm">
									<Link href={cluster.href}>Inspect</Link>
								</Button>
							</div>
						</CardContent>
					))}
				</Card>
			</section>
		</main>
	);
}
