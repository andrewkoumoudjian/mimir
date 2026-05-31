import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@midday/ui/card";
import type { Metadata } from "next";
import { getTransactions } from "@/lib/mimir/client";
import { reviewStats } from "@/lib/mimir/dashboard";

export const metadata: Metadata = {
	title: "Reviewer Roles | Mimir",
};

const roles = [
	["Queue reviewer", "Works flagged transactions with keyboard actions."],
	["Escalation owner", "Handles high-risk rows that need deeper review."],
	["Export owner", "Packages the updated CSV after decisions are captured."],
	["Demo narrator", "Explains baselines, graph signals, and feedback loop."],
] as const;

export default async function ReviewerRolesPage() {
	const transactionsPage = await getTransactions({ pageSize: 10000 }).catch(
		() => ({ data: [] }),
	);
	const stats = reviewStats(transactionsPage.data);

	return (
		<div className="space-y-12">
			<Card>
				<CardHeader>
					<CardTitle>Reviewer roles</CardTitle>
					<CardDescription>
						Team setup is scoped to the challenge workflow: triage, escalation,
						export, and demo explanation.
					</CardDescription>
				</CardHeader>

				<CardContent className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
					<div>
						<div className="text-muted-foreground">Pending flags</div>
						<div className="mt-1 font-medium">{stats.pending}</div>
					</div>
					<div>
						<div className="text-muted-foreground">Escalations</div>
						<div className="mt-1 font-medium">{stats.escalated}</div>
					</div>
					<div>
						<div className="text-muted-foreground">Reviewed flags</div>
						<div className="mt-1 font-medium">{stats.reviewed}</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Role contract</CardTitle>
					<CardDescription>
						The UI remains single-player for the challenge, but the ownership
						model is explicit for handoff.
					</CardDescription>
				</CardHeader>

				<CardContent className="space-y-4">
					{roles.map(([name, detail]) => (
						<div key={name} className="text-sm">
							<div className="font-medium">{name}</div>
							<div className="mt-1 text-muted-foreground">{detail}</div>
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
