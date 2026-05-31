import { Badge } from "@midday/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@midday/ui/table";
import type { Metadata } from "next";
import {
	fetchMimirSummary,
	getLiveNotifications,
	getMimirApiBaseUrl,
} from "@/lib/mimir/client";
import {
	EMPTY_SUMMARY,
	formatDateTime,
	statusClass,
	titleize,
} from "@/lib/mimir/dashboard";
import type { MimirSummary } from "@/lib/mimir/types";

export const metadata: Metadata = {
	title: "Data Sources | Mimir",
};

type LiveNotification = {
	id: string;
	status: string;
	createdAt: string;
	metadata: {
		message?: string;
		reason?: string;
	};
};

const sources = [
	["transactions.csv", "Primary challenge dataset."],
	["Mimir scoring API", "Risk scores, reasons, context, and review actions."],
	["Live review feed", "Detector flags and reviewer receipts."],
	["xFraud graph signal", "Shared device, IP, and merchant clusters."],
] as const;

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
			className={`px-2 py-0.5 text-[11px] capitalize ${statusClass(status)}`}
		>
			{titleize(status)}
		</Badge>
	);
}

export default async function DataSourcesPage() {
	const [summary, notifications] = await Promise.all([
		safeSummary(),
		getLiveNotifications({ pageSize: 8 }).catch(() => ({ data: [] })),
	]);
	const feed = notifications.data as LiveNotification[];

	return (
		<div className="mt-4 max-w-screen-lg">
			<div className="mb-6">
				<h2 className="text-lg font-medium leading-none tracking-tight mb-2">
					Data sources
				</h2>
				<p className="text-sm text-muted-foreground">
					The app store surface now reflects Mimir's fraud data sources while
					keeping the same compact Midday page treatment.
				</p>
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Source</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Detail</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{sources.map(([name, detail]) => {
						const status =
							name === "transactions.csv"
								? summary.processed_rows > 0
									? "ready"
									: "pending"
								: name === "Live review feed"
									? feed.length > 0
										? "ready"
										: "pending"
									: "active";

						return (
							<TableRow key={name}>
								<TableCell>
									<div className="font-medium">{name}</div>
									<div className="mt-1 text-xs text-muted-foreground">
										{detail}
									</div>
								</TableCell>
								<TableCell>
									<StatusBadge status={status} />
								</TableCell>
								<TableCell className="text-sm text-muted-foreground">
									{name === "transactions.csv"
										? `${summary.processed_rows || 0} rows processed`
										: name === "Mimir scoring API"
											? `${getMimirApiBaseUrl()} / ${summary.model_version}`
											: name === "Live review feed"
												? `${feed.length} recent events`
												: "Cross-card aggregation enabled"}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>

			<div className="mt-8">
				<h2 className="text-lg font-medium leading-none tracking-tight mb-4">
					Latest source events
				</h2>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Time</TableHead>
							<TableHead>Event</TableHead>
							<TableHead>Reason</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{feed.map((event) => (
							<TableRow key={event.id}>
								<TableCell className="whitespace-nowrap text-xs text-muted-foreground">
									{formatDateTime(event.createdAt)}
								</TableCell>
								<TableCell className="text-sm">
									{event.metadata.message ?? "Mimir feed update"}
								</TableCell>
								<TableCell className="text-xs text-muted-foreground">
									{event.metadata.reason ?? titleize(event.status)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				{feed.length === 0 && (
					<div className="text-center py-12 border border-border border-t-0 min-h-[180px] flex items-center justify-center">
						<p className="text-muted-foreground text-sm">
							No source events found
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
