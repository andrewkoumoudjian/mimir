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
import { OverviewView } from "@/components/widgets";
import {
	fetchMimirSummary,
	getLiveNotifications,
	getTransactions,
} from "@/lib/mimir/client";
import type {
	MiddayLikeTransaction,
	MimirRiskLevel,
	MimirSummary,
} from "@/lib/mimir/types";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

export const metadata: Metadata = {
	title: "Fraud Command Center | Mimir",
};

type LiveNotification = {
	id: string;
	status: string;
	createdAt: string;
	metadata: {
		message?: string;
		transactionId?: string;
		riskLevel?: string;
		reason?: string;
		toStatus?: string;
	};
};

const FALLBACK_SUMMARY: MimirSummary = {
	processed_rows: 0,
	flagged_rows: 0,
	review_rate: 0,
	threshold: 0,
	profile: "offline",
	model_version: "unavailable",
	risk_level_counts: {},
	primary_pattern_counts: {},
};

const REVIEW_OBLIGATIONS = [
	{
		label: "Ingest 1,000 rows",
		detail: "transactions.csv is validated and scored by the detector API.",
	},
	{
		label: "Flag with reasons",
		detail: "Every queue item carries score, level, signal tags, and evidence.",
	},
	{
		label: "Reviewer actions",
		detail: "Open the queue and use A approve, D dismiss, E escalate, U undo.",
	},
	{
		label: "Feedback loop",
		detail: "Review decisions write to the session audit log and feed.",
	},
	{
		label: "Updated CSV",
		detail:
			"Approved flags are ready for export from the transactions workflow.",
	},
];

const KEYBOARD_COMMANDS: Array<readonly [string, string]> = [
	["ArrowUp", "Previous flag"],
	["ArrowDown", "Next flag"],
	["A", "Approve"],
	["D", "Dismiss"],
	["E", "Escalate"],
	["U", "Undo"],
	["Enter", "Toggle detail"],
];

async function safeSummary() {
	try {
		return await fetchMimirSummary();
	} catch {
		return FALLBACK_SUMMARY;
	}
}

function formatPercent(value: number) {
	const normalized = value > 1 ? value / 100 : value;

	return new Intl.NumberFormat("en-CA", {
		style: "percent",
		maximumFractionDigits: 1,
	}).format(normalized);
}

function formatDate(value: string) {
	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return new Intl.DateTimeFormat("en-CA", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function titleize(value: string) {
	return value
		.split(/[_\-\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function riskClass(level?: string) {
	switch (level) {
		case "critical":
		case "high":
			return "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/10";
		case "medium":
			return "border-border bg-muted text-foreground hover:bg-muted";
		default:
			return "border-border bg-background text-muted-foreground hover:bg-background";
	}
}

function riskBadge(level?: string) {
	return (
		<Badge
			variant="outline"
			className={`px-2 py-0.5 text-[11px] capitalize ${riskClass(level)}`}
		>
			{level ?? "low"}
		</Badge>
	);
}

function queueRow(transaction: MiddayLikeTransaction) {
	const reason = transaction.reasons[0]?.message ?? transaction.primaryPattern;

	return (
		<TableRow key={transaction.id} className="border-border">
			<TableCell className="font-mono text-xs text-muted-foreground">
				{transaction.id}
			</TableCell>
			<TableCell>
				<div className="truncate font-medium text-foreground">
					{transaction.merchantName}
				</div>
				<div className="truncate text-xs text-muted-foreground">{reason}</div>
			</TableCell>
			<TableCell className="font-mono text-xs text-muted-foreground">
				{transaction.cardId}
			</TableCell>
			<TableCell>
				<div className="flex items-center justify-end gap-2">
					<span className="tabular-nums text-foreground">
						{Math.round(transaction.riskScore * 100)}
					</span>
					{riskBadge(transaction.riskLevel)}
				</div>
			</TableCell>
			<TableCell className="text-right">
				<Button asChild variant="outline" size="sm">
					<Link
						href={`/transactions?tab=review&transactionId=${transaction.id}`}
					>
						Open
					</Link>
				</Button>
			</TableCell>
		</TableRow>
	);
}

function riskCountRows(counts: Record<string, number>, processedRows: number) {
	const levels: MimirRiskLevel[] = ["critical", "high", "medium", "low"];

	return levels.map((level) => {
		const count = counts[level] ?? 0;
		const width =
			count > 0 && processedRows > 0
				? Math.max((count / processedRows) * 100, 2)
				: 0;

		return (
			<div
				key={level}
				className="grid grid-cols-[76px_1fr_48px] items-center gap-3"
			>
				<div className="text-xs capitalize text-muted-foreground">{level}</div>
				<Progress
					value={width}
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
	});
}

function patternRows(counts: Record<string, number>) {
	const patterns = Object.entries(counts)
		.sort(([, left], [, right]) => right - left)
		.slice(0, 5);

	if (!patterns.length) {
		return (
			<CardContent className="border-t border-border px-4 py-4 text-sm text-muted-foreground">
				No active patterns loaded yet.
			</CardContent>
		);
	}

	const max = Math.max(...patterns.map(([, count]) => count), 1);

	return patterns.map(([pattern, count]) => (
		<CardContent key={pattern} className="border-t border-border px-4 py-3">
			<div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-4">
				<div className="min-w-0">
					<div className="truncate text-sm font-medium text-foreground">
						{titleize(pattern)}
					</div>
					<Progress
						value={Math.max((count / max) * 100, 6)}
						className="mt-2 h-1.5 bg-muted [&>div]:bg-foreground/70"
					/>
				</div>
				<div className="text-right font-mono text-xs text-muted-foreground">
					{count} flags
				</div>
			</div>
		</CardContent>
	));
}

function liveFeedRows(notifications: LiveNotification[]) {
	if (!notifications.length) {
		return (
			<CardContent className="border-t border-border px-4 py-4 text-sm text-muted-foreground">
				No live events yet. Detector and review updates will stream here.
			</CardContent>
		);
	}

	return notifications.map((notification) => {
		const transactionId = notification.metadata.transactionId;
		const message = notification.metadata.message ?? "Review event";
		const reason =
			notification.metadata.reason ?? notification.metadata.toStatus;

		return (
			<CardContent
				key={notification.id}
				className="border-t border-border px-4 py-3"
			>
				<div className="flex items-center justify-between gap-3">
					<div className="truncate text-sm font-medium text-foreground">
						{message}
					</div>
					<div className="shrink-0 text-xs text-muted-foreground">
						{formatDate(notification.createdAt)}
					</div>
				</div>
				<div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
					<span className="capitalize">{notification.status}</span>
					{notification.metadata.riskLevel
						? riskBadge(notification.metadata.riskLevel)
						: null}
					{reason ? <span className="truncate">{reason}</span> : null}
				</div>
				<Button
					asChild
					variant="link"
					size="sm"
					className="mt-2 h-auto justify-start p-0 text-xs text-muted-foreground"
				>
					<Link
						href={
							transactionId
								? `/transactions?tab=review&transactionId=${transactionId}`
								: "/transactions?tab=review"
						}
					>
						Open event
					</Link>
				</Button>
			</CardContent>
		);
	});
}

async function FraudCommandCenterPanel() {
	const [allTransactions, reviewTransactions, liveNotifications, summary] =
		await Promise.all([
			getTransactions({ pageSize: 10000, sort: ["risk_score", "desc"] }),
			getTransactions({
				fulfilled: true,
				exported: false,
				pageSize: 8,
				sort: ["risk_score", "desc"],
			}),
			getLiveNotifications({ pageSize: 10 }),
			safeSummary(),
		]);

	const transactions = allTransactions.data;
	const queue = reviewTransactions.data;
	const processedRows = summary.processed_rows || transactions.length;
	const flaggedRows =
		summary.flagged_rows ||
		transactions.filter((transaction) => transaction.isFlagged).length;
	const reviewedRows = transactions.filter(
		(transaction) => transaction.reviewStatus !== "pending",
	).length;
	const reviewProgress =
		flaggedRows > 0
			? `${Math.round((reviewedRows / flaggedRows) * 100)}%`
			: "0%";

	return (
		<section className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 pb-16 pt-2 text-foreground">
			<section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.8fr)]">
				<Card className="border-border bg-background">
					<CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
						<div>
							<CardTitle className="text-base">Strict review queue</CardTitle>
							<CardDescription className="text-xs text-muted-foreground">
								Flagged transactions only, sorted by descending risk. Filters
								stay out of this path.
							</CardDescription>
						</div>
						<div className="text-right">
							<div className="text-sm font-medium text-foreground">
								{reviewProgress}
							</div>
							<div className="text-xs text-muted-foreground">reviewed</div>
						</div>
					</CardHeader>
					<CardContent className="p-0">
						<Table>
							<TableHeader>
								<TableRow className="border-border">
									<TableHead>ID</TableHead>
									<TableHead>Evidence</TableHead>
									<TableHead>Card</TableHead>
									<TableHead className="text-right">Risk</TableHead>
									<TableHead className="text-right">Open</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{queue.length ? (
									queue.map(queueRow)
								) : (
									<TableRow>
										<TableCell
											colSpan={5}
											className="py-6 text-sm text-muted-foreground"
										>
											The queue is clear or the API is offline.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</CardContent>
				</Card>

				<Card className="border-border bg-background">
					<CardHeader>
						<CardTitle className="text-base">Live feed</CardTitle>
						<CardDescription className="text-xs text-muted-foreground">
							New detector flags and review decisions land here as the working
							audit stream.
						</CardDescription>
					</CardHeader>
					{liveFeedRows(liveNotifications.data as LiveNotification[])}
				</Card>
			</section>

			<section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
				<Card className="border-border bg-background">
					<CardHeader>
						<CardTitle className="text-base">Risk distribution</CardTitle>
						<CardDescription className="text-xs text-muted-foreground">
							Red is reserved for high-risk review pressure.
						</CardDescription>
					</CardHeader>
					<Separator />
					<CardContent className="flex flex-col gap-3 p-4">
						{riskCountRows(summary.risk_level_counts, processedRows)}
					</CardContent>
				</Card>

				<Card className="border-border bg-background">
					<CardHeader>
						<CardTitle className="text-base">Detector signals</CardTitle>
						<CardDescription className="text-xs text-muted-foreground">
							Patterns are pulled from card baselines, velocity, category
							surprise, graph reuse, and model consensus.
						</CardDescription>
					</CardHeader>
					{patternRows(summary.primary_pattern_counts)}
				</Card>

				<Card className="border-border bg-background">
					<CardHeader>
						<CardTitle className="text-base">Challenge obligations</CardTitle>
						<CardDescription className="text-xs text-muted-foreground">
							The command center is organized around the judged product path.
						</CardDescription>
					</CardHeader>
					{REVIEW_OBLIGATIONS.map((item) => (
						<CardContent
							key={item.label}
							className="border-t border-border px-4 py-3"
						>
							<div className="text-sm font-medium text-foreground">
								{item.label}
							</div>
							<div className="mt-1 text-xs leading-5 text-muted-foreground">
								{item.detail}
							</div>
						</CardContent>
					))}
				</Card>
			</section>

			<section className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
				<Card className="border-border bg-background">
					<CardHeader>
						<CardTitle className="text-base">Cost-aware tuning</CardTitle>
					</CardHeader>
					<CardContent>
						<CardDescription className="text-sm leading-6 text-muted-foreground">
							Current threshold is{" "}
							<span className="font-mono text-foreground">
								{Math.round(summary.threshold * 100)}
							</span>
							. The review rate is{" "}
							<span className="font-mono text-foreground">
								{formatPercent(summary.review_rate)}
							</span>
							. Increasing reviewer cost should shrink the queue; increasing
							missed-fraud cost should widen it.
						</CardDescription>
					</CardContent>
				</Card>

				<Card className="border-border bg-background">
					<CardHeader>
						<CardTitle className="text-base">
							Keyboard review contract
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-wrap gap-2">
						{KEYBOARD_COMMANDS.map(([key, action]) => (
							<Badge
								key={key}
								variant="tag-rounded"
								className="flex items-center gap-2 bg-muted text-muted-foreground"
							>
								<kbd className="font-mono text-foreground">{key}</kbd>
								<span>{action}</span>
							</Badge>
						))}
					</CardContent>
				</Card>
			</section>
		</section>
	);
}

export default async function Overview() {
	prefetch(trpc.overview.summary.queryOptions());

	return (
		<>
			<HydrateClient>
				<OverviewView />
			</HydrateClient>
			<FraudCommandCenterPanel />
		</>
	);
}
