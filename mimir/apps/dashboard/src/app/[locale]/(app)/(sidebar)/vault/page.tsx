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
import { getLiveNotifications, getTransactions } from "@/lib/mimir/client";
import {
	formatDateTime,
	reviewStats,
	statusClass,
	titleize,
} from "@/lib/mimir/dashboard";

export const metadata: Metadata = {
	title: "Audit Trail | Mimir",
};

type AuditNotification = {
	id: string;
	status: string;
	createdAt: string;
	metadata: {
		message?: string;
		transactionId?: string;
		action?: string;
		fromStatus?: string;
		toStatus?: string;
		reviewer?: string;
		note?: string | null;
	};
};

function StatusBadge({ status }: { status?: string }) {
	return (
		<Badge
			variant="outline"
			className={`px-2 py-0.5 text-[11px] capitalize ${statusClass(status)}`}
		>
			{titleize(status ?? "pending")}
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

export default async function AuditTrailPage() {
	const [auditNotifications, transactionsPage] = await Promise.all([
		getLiveNotifications({ status: "archived", pageSize: 50 }),
		getTransactions({ pageSize: 10000 }),
	]);
	const audit = auditNotifications.data as AuditNotification[];
	const stats = reviewStats(transactionsPage.data);

	return (
		<main className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 py-6">
			<header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
				<div>
					<p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
						Audit Trail
					</p>
					<h1 className="mt-2 text-2xl font-medium">Reviewer receipt log</h1>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
						Every reviewer action should leave a defensible receipt: what
						changed, who made the decision, when it happened, and how to return
						to the transaction.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button asChild variant="outline" size="sm">
						<Link href="/transactions?tab=review">Continue review</Link>
					</Button>
					<Button asChild variant="outline" size="sm">
						<Link href="/invoices">Export package</Link>
					</Button>
				</div>
			</header>

			<section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
				<MetricCard
					label="Audit events"
					value={audit.length.toLocaleString("en-CA")}
					detail="Decision receipts loaded from the local Mimir audit stream."
				/>
				<MetricCard
					label="Approved fraud"
					value={stats.approved.toLocaleString("en-CA")}
					detail="Rows marked as fraud for the updated transaction file."
				/>
				<MetricCard
					label="Dismissed flags"
					value={stats.dismissed.toLocaleString("en-CA")}
					detail="False positives that feed session learning and reduce repeat noise."
				/>
				<MetricCard
					label="Escalations"
					value={stats.escalated.toLocaleString("en-CA")}
					detail="Items that need manual investigation beyond the challenge pass."
				/>
			</section>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Review decisions</CardTitle>
					<CardDescription className="text-xs">
						Use this as the demo receipt trail after keyboard triage.
					</CardDescription>
				</CardHeader>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Time</TableHead>
								<TableHead>Transaction</TableHead>
								<TableHead>Action</TableHead>
								<TableHead>Status change</TableHead>
								<TableHead>Reviewer</TableHead>
								<TableHead className="text-right">Open</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{audit.length ? (
								audit.map((event) => (
									<TableRow key={event.id}>
										<TableCell className="whitespace-nowrap text-xs text-muted-foreground">
											{formatDateTime(event.createdAt)}
										</TableCell>
										<TableCell className="font-mono text-xs">
											{event.metadata.transactionId ?? "unknown"}
										</TableCell>
										<TableCell>
											<StatusBadge
												status={
													event.metadata.action?.replace(/^undo:/, "undo ") ??
													event.status
												}
											/>
										</TableCell>
										<TableCell>
											<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
												<span>
													{titleize(event.metadata.fromStatus ?? "pending")}
												</span>
												<span>/</span>
												<span>
													{titleize(event.metadata.toStatus ?? "pending")}
												</span>
											</div>
										</TableCell>
										<TableCell className="text-sm text-muted-foreground">
											{event.metadata.reviewer ?? "dashboard_reviewer"}
										</TableCell>
										<TableCell className="text-right">
											<Button asChild variant="link" size="sm">
												<Link
													href={
														event.metadata.transactionId
															? `/transactions?tab=review&transactionId=${event.metadata.transactionId}`
															: "/transactions"
													}
												>
													Open
												</Link>
											</Button>
										</TableCell>
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell
										colSpan={6}
										className="py-6 text-sm text-muted-foreground"
									>
										No audit events yet. Approve, dismiss, escalate, or undo a
										flag in the review queue to create receipts.
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</main>
	);
}
