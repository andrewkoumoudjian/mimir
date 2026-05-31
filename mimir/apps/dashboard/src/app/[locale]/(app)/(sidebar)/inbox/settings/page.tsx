import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@midday/ui/card";
import type { Metadata } from "next";
import { getLiveNotifications } from "@/lib/mimir/client";
import { formatDateTime } from "@/lib/mimir/dashboard";

export const metadata: Metadata = {
	title: "Live Feed Settings | Mimir",
};

const rules = [
	"Create an unread feed item when a transaction crosses the review threshold.",
	"Archive approve, dismiss, escalate, and undo events into the audit trail.",
	"Deep-link every feed item back to the transaction evidence drawer.",
	"Keep the newest detector and reviewer events visible on the command center.",
];

type LiveNotification = {
	id: string;
	createdAt: string;
	metadata: {
		message?: string;
		reason?: string;
		transactionId?: string;
	};
};

export default async function LiveFeedSettingsPage() {
	const notifications = await getLiveNotifications({ pageSize: 5 }).catch(
		() => ({ data: [] }),
	);
	const feed = notifications.data as LiveNotification[];

	return (
		<div className="max-w-[800px]">
			<main className="mt-8">
				<div className="space-y-12">
					<Card>
						<CardHeader>
							<CardTitle>Live feed settings</CardTitle>
							<CardDescription>
								The evidence page is backed by the fraud event stream, not email
								inbox configuration.
							</CardDescription>
						</CardHeader>

						<CardContent className="space-y-3 text-sm text-muted-foreground">
							{rules.map((rule) => (
								<div key={rule}>{rule}</div>
							))}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Recent payloads</CardTitle>
							<CardDescription>
								A quick contract check for the newest live feed events.
							</CardDescription>
						</CardHeader>

						<CardContent className="space-y-4">
							{feed.length ? (
								feed.map((event) => (
									<div
										key={event.id}
										className="flex items-center justify-between gap-4 text-sm"
									>
										<div className="min-w-0 truncate">
											<div className="truncate font-medium">
												{event.metadata.message ?? "Mimir feed update"}
											</div>
											<div className="mt-1 truncate text-muted-foreground">
												{event.metadata.reason ?? event.metadata.transactionId}
											</div>
										</div>
										<div className="shrink-0 text-xs text-muted-foreground">
											{formatDateTime(event.createdAt)}
										</div>
									</div>
								))
							) : (
								<div className="text-sm text-muted-foreground">
									No live payloads available yet.
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	);
}
