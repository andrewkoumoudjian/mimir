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
import { fetchMimirSummary } from "@/lib/mimir/client";
import { EMPTY_SUMMARY, statusClass, titleize } from "@/lib/mimir/dashboard";
import type { MimirSummary } from "@/lib/mimir/types";

export const metadata: Metadata = {
	title: "CSV Artifacts | Mimir",
};

const artifacts = [
	[
		"updated_csv",
		"Updated transactions CSV",
		"transaction_id, fraud_flag, risk_score, risk_level, reasons",
	],
	[
		"risk_json",
		"Risk JSON",
		"component_scores, primary_pattern, model_version, review",
	],
	[
		"review_queue_json",
		"Review queue JSON",
		"rank, transaction_id, score, reasons, recommended_action",
	],
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

export default async function CsvArtifactsPage() {
	const summary = await safeSummary();
	const outputFiles = summary.output_files ?? {};

	return (
		<div className="max-w-screen-lg">
			<div className="mb-6">
				<h2 className="text-lg font-medium leading-none tracking-tight mb-2">
					CSV artifacts
				</h2>
				<p className="text-sm text-muted-foreground">
					Product definitions are backed by the challenge output contract.
				</p>
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Artifact</TableHead>
						<TableHead>Required fields</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Path</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{artifacts.map(([key, name, fields]) => {
						const path = outputFiles[key];

						return (
							<TableRow key={key}>
								<TableCell className="font-medium">{name}</TableCell>
								<TableCell className="font-mono text-xs text-muted-foreground">
									{fields}
								</TableCell>
								<TableCell>
									<StatusBadge status={path ? "ready" : "not generated"} />
								</TableCell>
								<TableCell className="max-w-[320px] truncate font-mono text-xs text-muted-foreground">
									{path ?? "Run the scorer or start the API"}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}
