import { Badge } from "@midday/ui/badge";
import { Button } from "@midday/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@midday/ui/card";
import { Separator } from "@midday/ui/separator";
import type { Metadata } from "next";
import Link from "next/link";
import { getLiveNotifications, getTransactions } from "@/lib/mimir/client";
import {
	formatDateTime,
	riskClass,
	scorePercent,
	statusClass,
	titleize,
	topReason,
} from "@/lib/mimir/dashboard";

export const metadata: Metadata = {
	title: "Live Feed | Mimir",
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
		reviewer?: string;
		note?: string | null;
	};
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

export default async function LiveFeedPage() {
	const [notifications, queuePage] = await Promise.all([
		getLiveNotifications({ pageSize: 18 }),
		getTransactions({
			fulfilled: true,
			exported: false,
			pageSize: 8,
			sort: ["risk_score", "desc"],
		}),
	]);
	const feed = notifications.data as LiveNotification[];
	const queue = queuePage.data;

	return (
		<main className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 py-6 text-foreground">
			<header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
				<div>
					<p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
						Live Feed
					</p>
					<h1 className="mt-2 text-2xl font-medium">
						Detector and reviewer stream
					</h1>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
						This is the working evidence feed: new flags, triage decisions,
						reviewer notes, and undo events stay visible while the queue moves.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button asChild variant="outline" size="sm">
						<Link href="/transactions?tab=review">Open queue</Link>
					</Button>
					<Button asChild variant="outline" size="sm">
						<Link href="/vault">Audit trail</Link>
					</Button>
				</div>
			</header>

			<section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
				<Card className="border-border bg-background">
					<CardHeader>
						<CardTitle className="text-base">Live event feed</CardTitle>
						<CardDescription className="text-xs text-muted-foreground">
							Audit events are mixed with the current detector queue.
						</CardDescription>
					</CardHeader>
					<Separator />
					{feed.length ? (
						feed.map((event) => {
							const transactionId = event.metadata.transactionId;
							return (
								<CardContent
									key={event.id}
									className="border-t border-border px-4 py-3 first:border-t-0"
								>
									<div className="flex items-start justify-between gap-4">
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<span className="truncate text-sm font-medium text-foreground">
													{event.metadata.message ?? "Mimir feed update"}
												</span>
												<StatusBadge status={event.status} />
												{event.metadata.riskLevel ? (
													<RiskBadge level={event.metadata.riskLevel} />
												) : null}
											</div>
											<div className="mt-1 truncate text-xs text-muted-foreground">
												{event.metadata.reason ??
													event.metadata.note ??
													event.metadata.toStatus ??
													"No note attached"}
											</div>
										</div>
										<div className="shrink-0 text-right">
											<div className="text-xs text-muted-foreground">
												{formatDateTime(event.createdAt)}
											</div>
											<Button asChild variant="link" size="sm">
												<Link
													href={
														transactionId
															? `/transactions?tab=review&transactionId=${transactionId}`
															: "/transactions?tab=review"
													}
												>
													Open
												</Link>
											</Button>
										</div>
									</div>
								</CardContent>
							);
						})
					) : (
						<CardContent className="border-t border-border px-4 py-6 text-sm text-muted-foreground">
							No feed events yet. Start the API or review a flag to populate the
							stream.
						</CardContent>
					)}
				</Card>

				<Card className="border-border bg-background">
					<CardHeader>
						<CardTitle className="text-base">Current high-risk items</CardTitle>
						<CardDescription className="text-xs text-muted-foreground">
							The feed should help the reviewer decide what to open next.
						</CardDescription>
					</CardHeader>
					<Separator />
					{queue.length ? (
						queue.map((transaction) => (
							<CardContent
								key={transaction.id}
								className="border-t border-border px-4 py-3 first:border-t-0"
							>
								<div className="flex items-start justify-between gap-4">
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span className="font-mono text-xs text-muted-foreground">
												{transaction.id}
											</span>
											<RiskBadge level={transaction.riskLevel} />
										</div>
										<div className="mt-2 truncate text-sm font-medium text-foreground">
											{transaction.merchantName}
										</div>
										<div className="mt-1 truncate text-xs text-muted-foreground">
											{topReason(transaction)}
										</div>
									</div>
									<div className="shrink-0 text-right">
										<div className="font-mono text-sm text-foreground">
											{scorePercent(transaction.riskScore)}
										</div>
										<Button asChild variant="link" size="sm">
											<Link
												href={`/transactions?tab=review&transactionId=${transaction.id}`}
											>
												Review
											</Link>
										</Button>
									</div>
								</div>
							</CardContent>
						))
					) : (
						<CardContent className="border-t border-border px-4 py-6 text-sm text-muted-foreground">
							The review queue is clear or the local API is offline.
						</CardContent>
					)}
				</Card>
			</section>
		</main>
	);
}
