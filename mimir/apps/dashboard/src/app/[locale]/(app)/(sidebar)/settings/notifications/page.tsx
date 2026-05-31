import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@midday/ui/card";
import type { Metadata } from "next";
import { getLiveNotifications } from "@/lib/mimir/client";
import { formatDateTime, titleize } from "@/lib/mimir/dashboard";

export const metadata: Metadata = {
	title: "Alert Routing | Mimir",
};

const routes = [
	["Critical flags", "Risk level critical or recommended action escalate."],
	["Reviewer decisions", "Approve, dismiss, escalate, and undo receipts."],
	["Export readiness", "Notify when no high-risk flags remain pending."],
	["Suppressed repeats", "Dismissed false positives as session feedback."],
] as const;

type LiveNotification = {
	id: string;
	status: string;
	createdAt: string;
	metadata: {
		message?: string;
		reason?: string;
		toStatus?: string;
	};
};

export default async function AlertRoutingPage() {
	const notifications = await getLiveNotifications({ pageSize: 5 }).catch(
		() => ({ data: [] }),
	);
	const feed = notifications.data as LiveNotification[];

	return (
		<div className="space-y-12">
			<Card>
				<CardHeader>
					<CardTitle>Alert routing</CardTitle>
					<CardDescription>
						Notifications are routed around the fraud reviewer: what enters the
						queue, what lands in audit, and what proves feedback is working.
					</CardDescription>
				</CardHeader>

				<CardContent className="space-y-4">
					{routes.map(([name, detail]) => (
						<div key={name} className="text-sm">
							<div className="font-medium">{name}</div>
							<div className="mt-1 text-muted-foreground">{detail}</div>
						</div>
					))}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Recent events</CardTitle>
					<CardDescription>
						Latest detector or reviewer events from the Mimir live feed.
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
										{event.metadata.message ?? "Mimir alert"}
									</div>
									<div className="mt-1 truncate text-muted-foreground">
										{event.metadata.reason ??
											event.metadata.toStatus ??
											titleize(event.status)}
									</div>
								</div>
								<div className="shrink-0 text-xs text-muted-foreground">
									{formatDateTime(event.createdAt)}
								</div>
							</div>
						))
					) : (
						<div className="text-sm text-muted-foreground">
							No routed events yet.
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
