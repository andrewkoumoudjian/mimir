import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@midday/ui/card";
import type { Metadata } from "next";
import { getTransactions } from "@/lib/mimir/client";
import {
	buildCardBaselines,
	buildEntityClusters,
	formatMoney,
} from "@/lib/mimir/dashboard";

export const metadata: Metadata = {
	title: "Data Sources | Mimir",
};

export default async function DataSourcesSettingsPage() {
	const transactionsPage = await getTransactions({
		pageSize: 10000,
		sort: ["risk_score", "desc"],
	}).catch(() => ({ data: [] }));
	const transactions = transactionsPage.data;
	const cards = buildCardBaselines(transactions);
	const clusters = buildEntityClusters(transactions);
	const flaggedExposure = cards.reduce(
		(total, card) => total + card.flaggedExposure,
		0,
	);

	return (
		<div className="space-y-12">
			<Card>
				<CardHeader>
					<CardTitle>Data sources</CardTitle>
					<CardDescription>
						The dashboard is connected to Mimir transaction scoring instead of
						bank-account feeds. This view shows the active fraud data coverage.
					</CardDescription>
				</CardHeader>

				<CardContent className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
					<div>
						<div className="text-muted-foreground">Rows loaded</div>
						<div className="mt-1 font-medium">
							{transactions.length.toLocaleString("en-CA")}
						</div>
					</div>
					<div>
						<div className="text-muted-foreground">Cards profiled</div>
						<div className="mt-1 font-medium">
							{cards.length.toLocaleString("en-CA")}
						</div>
					</div>
					<div>
						<div className="text-muted-foreground">Shared clusters</div>
						<div className="mt-1 font-medium">
							{clusters.length.toLocaleString("en-CA")}
						</div>
					</div>
					<div>
						<div className="text-muted-foreground">Flagged exposure</div>
						<div className="mt-1 font-medium">
							{formatMoney(flaggedExposure)}
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Cross-card graph source</CardTitle>
					<CardDescription>
						Shared devices, IPs, and merchants are treated as first-class
						sources because one hidden fraud pattern is invisible from a single
						card baseline.
					</CardDescription>
				</CardHeader>

				<CardContent className="space-y-3 text-sm">
					{clusters.slice(0, 5).map((cluster) => (
						<div
							key={`${cluster.kind}-${cluster.id}`}
							className="flex items-center justify-between gap-4"
						>
							<div className="min-w-0 truncate">
								<span className="font-medium">{cluster.id}</span>
								<span className="ml-2 text-muted-foreground">
									{cluster.kind} across {cluster.cardCount} cards
								</span>
							</div>
							<div className="font-mono text-xs text-muted-foreground">
								{cluster.flaggedCount} flags
							</div>
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
