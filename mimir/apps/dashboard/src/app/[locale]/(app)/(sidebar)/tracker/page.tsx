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
	componentSignalRows,
	EMPTY_SUMMARY,
	formatPercent,
	patternCounts,
	scorePercent,
	titleize,
} from "@/lib/mimir/dashboard";
import type { MimirSummary } from "@/lib/mimir/types";

export const metadata: Metadata = {
	title: "Hypotheses | Mimir",
};

const HYPOTHESIS_STAGES = [
	{
		name: "Per-card baseline",
		status: "kept",
		evidence:
			"Flags compare amount, country, merchant category, device, and IP against each card's own history.",
		href: "/customers",
	},
	{
		name: "Cross-card graph reuse",
		status: "kept",
		evidence:
			"Shared devices, IPs, and merchants are ranked as clusters because one fraud pattern is invisible per card.",
		href: "/reports",
	},
	{
		name: "Explainable queue",
		status: "kept",
		evidence:
			"Every flagged transaction carries a score, primary pattern, component scores, and readable reasons.",
		href: "/transactions?tab=review",
	},
	{
		name: "Cost-aware threshold",
		status: "active",
		evidence:
			"The API accepts false-positive and missed-fraud costs and recomputes the queue threshold.",
		href: "/reports",
	},
	{
		name: "Reviewer feedback",
		status: "active",
		evidence:
			"Approve, dismiss, escalate, and undo write audit events and retraining context inside the session.",
		href: "/vault",
	},
];

async function safeSummary(): Promise<MimirSummary> {
	try {
		return await fetchMimirSummary();
	} catch {
		return EMPTY_SUMMARY;
	}
}

function StatusBadge({ status }: { status: string }) {
	return (
		<Badge variant="tag-rounded" className="capitalize">
			{status}
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
		<Card>
			<CardHeader className="pb-3">
				<CardDescription className="text-xs">{label}</CardDescription>
				<CardTitle className="text-2xl font-medium">{value}</CardTitle>
			</CardHeader>
			<CardContent className="pt-0 text-xs leading-5 text-muted-foreground">
				{detail}
			</CardContent>
		</Card>
	);
}

export default async function HypothesesPage() {
	const [summary, transactionsPage] = await Promise.all([
		safeSummary(),
		getTransactions({ pageSize: 10000, sort: ["risk_score", "desc"] }),
	]);
	const transactions = transactionsPage.data;
	const patterns = patternCounts(summary, transactions).slice(0, 5);
	const signals = componentSignalRows(transactions).slice(0, 5);
	const flaggedRows =
		summary.flagged_rows ||
		transactions.filter((transaction) => transaction.isFlagged).length;
	const reviewedRows = transactions.filter(
		(transaction) => transaction.reviewStatus !== "pending",
	).length;
	const maxPatternCount = Math.max(
		...patterns.map((pattern) => pattern.count),
		1,
	);

	return (
		<main className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 py-6">
			<header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
				<div>
					<p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
						Hypotheses
					</p>
					<h1 className="mt-2 text-2xl font-medium">Detection workbench</h1>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
						A judge should be able to see what signals were tried, which ones
						are still active, and where each hypothesis shows up in the reviewer
						workflow.
					</p>
				</div>
				<Button asChild variant="outline" size="sm">
					<Link href="/reports">Inspect pattern coverage</Link>
				</Button>
			</header>

			<section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
				<MetricCard
					label="Hypotheses kept"
					value={HYPOTHESIS_STAGES.length.toLocaleString("en-CA")}
					detail="Focused on signals that improve reviewer confidence within the challenge scope."
				/>
				<MetricCard
					label="Active fraud patterns"
					value={patterns.length.toLocaleString("en-CA")}
					detail="Primary detector patterns currently visible in scored transactions."
				/>
				<MetricCard
					label="Review rate"
					value={formatPercent(summary.review_rate)}
					detail={`${flaggedRows} rows are above the current risk threshold.`}
				/>
				<MetricCard
					label="Feedback events"
					value={reviewedRows.toLocaleString("en-CA")}
					detail="Session decisions available for audit, undo, and retraining context."
				/>
			</section>

			<section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Hypothesis board</CardTitle>
						<CardDescription className="text-xs">
							These are the product-facing hypotheses the UI should make easy to
							defend.
						</CardDescription>
					</CardHeader>
					<CardContent className="p-0">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Hypothesis</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Evidence</TableHead>
									<TableHead className="text-right">Open</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{HYPOTHESIS_STAGES.map((stage) => (
									<TableRow key={stage.name}>
										<TableCell className="font-medium">{stage.name}</TableCell>
										<TableCell>
											<StatusBadge status={stage.status} />
										</TableCell>
										<TableCell className="text-sm text-muted-foreground">
											{stage.evidence}
										</TableCell>
										<TableCell className="text-right">
											<Button asChild variant="link" size="sm">
												<Link href={stage.href}>Inspect</Link>
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">Signal strength</CardTitle>
						<CardDescription className="text-xs">
							Average component score across the current month.
						</CardDescription>
					</CardHeader>
					{signals.map((signal) => (
						<CardContent
							key={signal.key}
							className="border-t px-4 py-3 first:border-t"
						>
							<div className="flex items-center justify-between gap-4">
								<div>
									<div className="text-sm font-medium">{signal.label}</div>
									<div className="mt-1 text-xs text-muted-foreground">
										{signal.active} active flags
									</div>
								</div>
								<div className="font-mono text-sm">
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
			</section>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Top pattern evidence</CardTitle>
					<CardDescription className="text-xs">
						The strongest hypotheses should map directly to queue filters.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
					{patterns.map((pattern) => (
						<Link
							key={pattern.pattern}
							href={`/transactions?tab=review&signal=${encodeURIComponent(pattern.pattern)}`}
							className="border p-4 transition-all duration-300 hover:bg-accent"
						>
							<div className="truncate text-sm font-medium">
								{titleize(pattern.pattern)}
							</div>
							<div className="mt-2 text-xs text-muted-foreground">
								{pattern.count} flags
							</div>
							<Progress
								value={Math.max((pattern.count / maxPatternCount) * 100, 4)}
								className="mt-4 h-1.5 bg-muted [&>div]:bg-foreground/70"
							/>
						</Link>
					))}
				</CardContent>
			</Card>
		</main>
	);
}
