import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@midday/ui/card";
import { Progress } from "@midday/ui/progress";
import type { Metadata } from "next";
import { fetchMimirSummary } from "@/lib/mimir/client";
import { EMPTY_SUMMARY, formatPercent } from "@/lib/mimir/dashboard";
import type { MimirSummary } from "@/lib/mimir/types";

export const metadata: Metadata = {
	title: "Cost Controls | Mimir",
};

const profiles = [
	{
		name: "Balanced review",
		falsePositive: "1x",
		missedFraud: "5x",
		detail: "Default demo posture.",
		delta: 0,
	},
	{
		name: "Reviewer constrained",
		falsePositive: "3x",
		missedFraud: "5x",
		detail: "Raises the threshold and reduces queue volume.",
		delta: 8,
	},
	{
		name: "Loss constrained",
		falsePositive: "1x",
		missedFraud: "12x",
		detail: "Lowers the threshold and catches more medium-risk rows.",
		delta: -7,
	},
];

async function safeSummary(): Promise<MimirSummary> {
	try {
		return await fetchMimirSummary();
	} catch {
		return EMPTY_SUMMARY;
	}
}

function clamp(value: number) {
	return Math.max(0, Math.min(100, value));
}

export default async function CostControlsPage() {
	const summary = await safeSummary();
	const threshold = Math.round(summary.threshold * 100);

	return (
		<div className="space-y-12">
			<Card>
				<CardHeader>
					<CardTitle>Cost controls</CardTitle>
					<CardDescription>
						Tune the tradeoff between false positives and missed fraud. The
						current scoring run is operating at {threshold} with a{" "}
						{formatPercent(summary.review_rate)} review rate.
					</CardDescription>
				</CardHeader>

				<CardContent className="space-y-4">
					{profiles.map((profile) => {
						const projected = clamp(threshold + profile.delta);

						return (
							<div key={profile.name}>
								<div className="mb-2 flex items-center justify-between gap-4 text-sm">
									<div>
										<div className="font-medium">{profile.name}</div>
										<div className="text-xs text-muted-foreground">
											False positive {profile.falsePositive} / missed fraud{" "}
											{profile.missedFraud}. {profile.detail}
										</div>
									</div>
									<div className="font-mono text-xs">{projected}</div>
								</div>
								<Progress
									value={projected}
									className="h-1.5 bg-muted [&>div]:bg-foreground/70"
								/>
							</div>
						);
					})}
				</CardContent>
			</Card>
		</div>
	);
}
