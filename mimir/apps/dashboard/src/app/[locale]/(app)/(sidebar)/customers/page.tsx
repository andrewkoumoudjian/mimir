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
import { getTransactions } from "@/lib/mimir/client";
import {
	buildCardBaselines,
	formatMoney,
	riskClass,
	scorePercent,
} from "@/lib/mimir/dashboard";

export const metadata: Metadata = {
	title: "Cards | Mimir",
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

export default async function CardsPage() {
	const transactionsPage = await getTransactions({
		pageSize: 10000,
		sort: ["risk_score", "desc"],
	});
	const transactions = transactionsPage.data;
	const cards = buildCardBaselines(transactions);
	const flaggedCards = cards.filter((card) => card.flaggedCount > 0);
	const pendingCards = cards.filter((card) => card.pendingCount > 0);
	const exposure = cards.reduce(
		(total, card) => total + card.flaggedExposure,
		0,
	);
	const sharedDeviceCards = cards.filter(
		(card) => card.deviceCount > 1 || card.ipCount > 1,
	);

	return (
		<main className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 py-6 text-foreground">
			<header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
				<div>
					<p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
						Card Baselines
					</p>
					<h1 className="mt-2 text-2xl font-medium">Per-card fraud posture</h1>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
						Each card is profiled by normal amount, category, geography, device,
						IP, and review state so reviewers can compare a flag against that
						card's own behavior.
					</p>
				</div>
				<Button asChild variant="outline" size="sm">
					<Link href="/transactions?tab=review">Review flagged cards</Link>
				</Button>
			</header>

			<section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
				<MetricCard
					label="Cards profiled"
					value={cards.length.toLocaleString("en-CA")}
					detail="The challenge dataset contains 50 card histories."
				/>
				<MetricCard
					label="Cards with flags"
					value={flaggedCards.length.toLocaleString("en-CA")}
					detail="Cards with at least one transaction above the review threshold."
				/>
				<MetricCard
					label="Cards pending review"
					value={pendingCards.length.toLocaleString("en-CA")}
					detail="Cards still carrying approve, dismiss, or escalate work."
				/>
				<MetricCard
					label="Flagged exposure"
					value={formatMoney(exposure)}
					detail={`${sharedDeviceCards.length} cards show multiple device or IP observations.`}
				/>
			</section>

			<Card className="border-border bg-background">
				<CardHeader>
					<CardTitle className="text-base">Card baseline queue</CardTitle>
					<CardDescription className="text-xs text-muted-foreground">
						Sorted by highest observed risk, then flagged count.
					</CardDescription>
				</CardHeader>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow className="border-border">
								<TableHead>Card</TableHead>
								<TableHead>Baseline</TableHead>
								<TableHead>Entity spread</TableHead>
								<TableHead className="text-right">Flags</TableHead>
								<TableHead className="text-right">Max risk</TableHead>
								<TableHead className="text-right">Open</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{cards.slice(0, 24).map((card) => (
								<TableRow key={card.cardId} className="border-border">
									<TableCell>
										<div className="font-mono text-xs text-muted-foreground">
											{card.cardId}
										</div>
										<div className="mt-1 truncate text-xs text-muted-foreground">
											{card.lastSignal}
										</div>
									</TableCell>
									<TableCell>
										<div className="text-sm text-foreground">
											{formatMoney(card.medianAmount)} median
										</div>
										<div className="mt-1 text-xs text-muted-foreground">
											{card.topCategory} / {card.transactionCount} tx
										</div>
									</TableCell>
									<TableCell>
										<div className="text-sm text-foreground">
											{card.countryCount} countries
										</div>
										<div className="mt-1 text-xs text-muted-foreground">
											{card.deviceCount} devices / {card.ipCount} IPs
										</div>
									</TableCell>
									<TableCell className="text-right">
										<div className="font-mono text-sm text-foreground">
											{card.flaggedCount}
										</div>
										<div className="text-xs text-muted-foreground">
											{card.pendingCount} pending
										</div>
									</TableCell>
									<TableCell className="text-right">
										<div className="flex items-center justify-end gap-2">
											<span className="font-mono text-sm text-foreground">
												{scorePercent(card.maxRisk)}
											</span>
											<RiskBadge level={card.riskLevel} />
										</div>
									</TableCell>
									<TableCell className="text-right">
										<Button asChild variant="link" size="sm">
											<Link
												href={
													card.pendingCount > 0 ? card.reviewHref : card.href
												}
											>
												Inspect
											</Link>
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</main>
	);
}
