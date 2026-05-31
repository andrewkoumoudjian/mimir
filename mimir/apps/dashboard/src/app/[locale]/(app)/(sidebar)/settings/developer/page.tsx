import { Badge } from "@midday/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@midday/ui/card";
import type { Metadata } from "next";
import { getMimirApiBaseUrl } from "@/lib/mimir/client";

export const metadata: Metadata = {
	title: "API Contract | Mimir",
};

const endpoints = [
	["GET", "/summary", "Command center metrics and output files."],
	["GET", "/transactions", "Scored rows with filters and review state."],
	["GET", "/transactions/:id/context", "Evidence, card timeline, and graph."],
	["POST", "/review/:id", "Approve, dismiss, or escalate a flag."],
	["POST", "/review/undo", "Undo the latest reviewer action."],
	["GET", "/notifications", "Live feed events."],
] as const;

export default function ApiContractPage() {
	return (
		<div className="space-y-12">
			<Card>
				<CardHeader>
					<CardTitle>API contract</CardTitle>
					<CardDescription>
						The dashboard uses the local Mimir API for scoring, explanations,
						review actions, undo, artifacts, and live feed events.
					</CardDescription>
				</CardHeader>

				<CardContent>
					<div className="font-mono text-sm">{getMimirApiBaseUrl()}</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Endpoints</CardTitle>
					<CardDescription>
						Backend surfaces exercised by the fraud command center.
					</CardDescription>
				</CardHeader>

				<CardContent className="space-y-4">
					{endpoints.map(([method, path, purpose]) => (
						<div
							key={`${method}-${path}`}
							className="grid grid-cols-[72px_1fr] gap-3 text-sm"
						>
							<Badge variant="tag-rounded" className="w-fit">
								{method}
							</Badge>
							<div className="min-w-0">
								<div className="font-mono text-xs">{path}</div>
								<div className="mt-1 text-muted-foreground">{purpose}</div>
							</div>
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
