import { Badge } from "@midday/ui/badge";
import { Button } from "@midday/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@midday/ui/card";
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
	EMPTY_SUMMARY,
	formatMoney,
	formatPercent,
	reviewStats,
	statusClass,
} from "@/lib/mimir/dashboard";
import type { MimirSummary } from "@/lib/mimir/types";

export const metadata: Metadata = {
	title: "Exports | Mimir",
};

const ARTIFACT_LABELS: Record<string, { name: string; detail: string }> = {
	updated_csv: {
		name: "Updated transactions CSV",
		detail:
			"Original rows with fraud flag, risk score, reasons, and review state.",
	},
	risk_json: {
		name: "Risk JSON",
		detail: "Full detector output for the UI and demo inspection.",
	},
	review_queue_json: {
		name: "Review queue JSON",
		detail: "Flagged subset ordered for reviewer triage.",
	},
};

async function safeSummary(): Promise<MimirSummary> {
	try {
		return await fetchMimirSummary();
	} catch {
		return EMPTY_SUMMARY;
	}
}

function StatusBadge({ status }: { status: string }) {
	return (
		<Badge
			variant="outline"
			className={`px-2 py-0.5 text-[11px] ${statusClass(status)}`}
		>
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

export default async function ExportsPage() {
	const [summary, transactionsPage] = await Promise.all([
		safeSummary(),
		getTransactions({ pageSize: 10000 }),
	]);
	const stats = reviewStats(transactionsPage.data);
	const outputFiles = summary.output_files ?? {};
	const artifactRows = Object.entries(ARTIFACT_LABELS).map(([key, value]) => ({
		key,
		...value,
		path: outputFiles[key],
	}));

	return (
		<main className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 py-6 text-foreground">
			<header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
				<div>
					<p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
						Export Package
					</p>
					<h1 className="mt-2 text-2xl font-medium">
						Updated transaction file
					</h1>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
						The challenge requires an updated CSV with identified fraud rows
						marked. This page shows the artifact contract and whether the review
						queue is ready to package.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button asChild variant="outline" size="sm">
						<Link href="/transactions?tab=review">Approve flags</Link>
					</Button>
					<Button asChild variant="outline" size="sm">
						<Link href="/vault">View audit trail</Link>
					</Button>
				</div>
			</header>

			<section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
				<MetricCard
					label="Flagged rows"
					value={stats.flagged.toLocaleString("en-CA")}
					detail={`${formatPercent(summary.review_rate)} review rate at the current threshold.`}
				/>
				<MetricCard
					label="Pending decisions"
					value={stats.pending.toLocaleString("en-CA")}
					detail="Rows still waiting for approve, dismiss, or escalate."
				/>
				<MetricCard
					label="Reviewed flags"
					value={stats.reviewed.toLocaleString("en-CA")}
					detail={`${stats.approved} approved, ${stats.dismissed} dismissed, ${stats.escalated} escalated.`}
				/>
				<MetricCard
					label="Flagged exposure"
					value={formatMoney(stats.exposure)}
					detail="Exposure stays visible so export decisions remain cost-aware."
				/>
			</section>

			<section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
				<Card className="border-border bg-background">
					<CardHeader>
						<CardTitle className="text-base">Generated artifacts</CardTitle>
						<CardDescription className="text-xs text-muted-foreground">
							Written by the fraud engine whenever the local API starts or the
							scoring command runs.
						</CardDescription>
					</CardHeader>
					<CardContent className="p-0">
						<Table>
							<TableHeader>
								<TableRow className="border-border">
									<TableHead>Artifact</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Path</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{artifactRows.map((artifact) => (
									<TableRow key={artifact.key} className="border-border">
										<TableCell>
											<div className="text-sm font-medium text-foreground">
												{artifact.name}
											</div>
											<div className="mt-1 text-xs text-muted-foreground">
												{artifact.detail}
											</div>
										</TableCell>
										<TableCell>
											<StatusBadge
												status={artifact.path ? "ready" : "not generated"}
											/>
										</TableCell>
										<TableCell className="max-w-[420px] truncate font-mono text-xs text-muted-foreground">
											{artifact.path ?? "Start the Mimir API or run the scorer"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>

				<Card className="border-border bg-background">
					<CardHeader>
						<CardTitle className="text-base">Export readiness</CardTitle>
						<CardDescription className="text-xs text-muted-foreground">
							Keep the package defensible for judges and reproducible from a
							clean clone.
						</CardDescription>
					</CardHeader>
					{[
						["1,000 rows processed", summary.processed_rows > 0],
						["Suspicious rows flagged", stats.flagged > 0],
						["Human decisions captured", stats.reviewed > 0],
						["Updated CSV generated", Boolean(outputFiles.updated_csv)],
						["Audit trail available", stats.reviewed > 0],
					].map(([label, done]) => (
						<CardContent
							key={String(label)}
							className="flex items-center justify-between border-t border-border px-4 py-3"
						>
							<span className="text-sm text-foreground">{label}</span>
							<StatusBadge status={done ? "ready" : "pending"} />
						</CardContent>
					))}
				</Card>
			</section>
		</main>
	);
}
