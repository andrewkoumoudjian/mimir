"use client";

import { Badge } from "@midday/ui/badge";
import { Button } from "@midday/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@midday/ui/card";
import { Progress } from "@midday/ui/progress";
import { Separator } from "@midday/ui/separator";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	riskClass,
	scorePercent,
	titleize,
} from "@/lib/mimir/dashboard";
import { fetchMimirSyntheticLiveFeed } from "@/lib/mimir/client";
import type {
	MimirRiskLevel,
	MimirSyntheticLiveEvent,
} from "@/lib/mimir/types";

type TimelineEvent = {
	id: string;
	createdAt: string;
	transactionId: string;
	cardId: string;
	merchantName: string;
	merchantCategory: string;
	amount: number;
	channel: string;
	merchantCountry: string;
	riskScore: number;
	riskLevel: MimirRiskLevel;
	primaryPattern: string;
	reasons: string[];
	componentScores: Array<{ label: string; value: number }>;
	recommendedAction: string;
	source: string;
};

type Diagnostics = {
	processed_rows: number;
	flagged_rows: number;
	threshold: number;
	model_version: string;
};

function formatTime(value: string) {
	return new Intl.DateTimeFormat("en-CA", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).format(new Date(value));
}

function readableError(error: unknown) {
	return error instanceof Error ? error.message : "Unable to load live feed";
}

function mapLiveEvent(event: MimirSyntheticLiveEvent): TimelineEvent {
	const componentScores = Object.entries(event.component_scores)
		.sort(([, left], [, right]) => right - left)
		.slice(0, 4)
		.map(([label, value]) => ({ label: titleize(label), value }));

	return {
		id: `${event.transaction_id}-${event.arrival_index}`,
		createdAt: event.received_at || event.timestamp,
		transactionId: event.transaction_id,
		cardId: event.card_id,
		merchantName: event.merchant_name,
		merchantCategory: event.merchant_category,
		amount: Math.abs(event.amount),
		channel: event.channel,
		merchantCountry: event.merchant_country,
		riskScore: event.risk_score,
		riskLevel: event.risk_level,
		primaryPattern: event.primary_pattern,
		reasons: event.reasons.length
			? event.reasons.slice(0, 3).map((reason) => reason.message)
			: [titleize(event.primary_pattern)],
		componentScores,
		recommendedAction: event.recommended_action,
		source: event.source,
	};
}

function RiskBadge({ level }: { level: MimirRiskLevel }) {
	return (
		<Badge
			variant="outline"
			className={`px-2 py-0.5 text-[11px] capitalize ${riskClass(level)}`}
		>
			{level}
		</Badge>
	);
}

export function SyntheticLiveTimeline() {
	const cursorRef = useRef(0);
	const fetchingRef = useRef(false);
	const [active, setActive] = useState(false);
	const [loading, setLoading] = useState(false);
	const [cursor, setCursor] = useState(0);
	const [events, setEvents] = useState<TimelineEvent[]>([]);
	const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
	const [error, setError] = useState<string | null>(null);
	const highRiskCount = events.filter(
		(event) => event.riskLevel === "critical" || event.riskLevel === "high",
	).length;
	const streamStatus = error
		? "Unavailable"
		: active
			? "Active"
			: events.length
				? "Paused"
				: "Ready";

	const fetchNextBatch = useCallback(async () => {
		if (fetchingRef.current) {
			return;
		}

		fetchingRef.current = true;
		setLoading(true);
		try {
			const feed = await fetchMimirSyntheticLiveFeed({
				cursor: cursorRef.current,
				count: 3,
			});
			cursorRef.current = feed.next_cursor;
			setCursor(feed.next_cursor);
			setDiagnostics(feed.diagnostics ?? null);
			setError(null);
			setEvents((current) => {
				const incoming = feed.events.map(mapLiveEvent);
				const seen = new Set(current.map((event) => event.id));
				return [
					...incoming.filter((event) => !seen.has(event.id)),
					...current,
				].slice(0, 24);
			});
		} catch (fetchError) {
			setError(readableError(fetchError));
			setActive(false);
		} finally {
			fetchingRef.current = false;
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!active) {
			return;
		}

		void fetchNextBatch();
		const timer = window.setInterval(() => {
			void fetchNextBatch();
		}, 3500);

		return () => window.clearInterval(timer);
	}, [active, fetchNextBatch]);

	const resetStream = () => {
		cursorRef.current = 0;
		setActive(false);
		setLoading(false);
		setCursor(0);
		setEvents([]);
		setDiagnostics(null);
		setError(null);
	};

	return (
		<main className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 py-6 text-foreground">
			<header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
				<div>
					<p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
						Synthetic Live Feed
					</p>
					<h1 className="mt-2 text-2xl font-medium">
						Continuous transaction timeline
					</h1>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
						Rust-backed synthetic transactions from the Mimir API, scored with
						the same analysis contract as the review queue.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						variant={active ? "outline" : "default"}
						size="sm"
						disabled={loading && !active}
						onClick={() => setActive((value) => !value)}
					>
						{active ? "Pause stream" : "Activate live synthetic data"}
					</Button>
					<Button variant="outline" size="sm" onClick={resetStream}>
						Reset
					</Button>
					<Button asChild variant="outline" size="sm">
						<Link href="/transactions?tab=review">Open queue</Link>
					</Button>
				</div>
			</header>

			<section className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<Card className="border-border bg-background">
					<CardHeader className="pb-3">
						<CardDescription className="text-xs text-muted-foreground">
							Stream status
						</CardDescription>
						<CardTitle className="text-2xl font-medium">
							{streamStatus}
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-0 text-xs leading-5 text-muted-foreground">
						{error ??
							(active
								? "Polling /synthetic/live from the local Mimir API."
								: "No live requests are running.")}
					</CardContent>
				</Card>
				<Card className="border-border bg-background">
					<CardHeader className="pb-3">
						<CardDescription className="text-xs text-muted-foreground">
							Timeline events
						</CardDescription>
						<CardTitle className="text-2xl font-medium">
							{events.length}
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-0 text-xs leading-5 text-muted-foreground">
						{cursor ? `${cursor} generated events requested from API.` : "Ready"}
					</CardContent>
				</Card>
				<Card className="border-border bg-background">
					<CardHeader className="pb-3">
						<CardDescription className="text-xs text-muted-foreground">
							High-risk events
						</CardDescription>
						<CardTitle className="text-2xl font-medium">
							{highRiskCount}
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-0 text-xs leading-5 text-muted-foreground">
						{diagnostics
							? `${diagnostics.flagged_rows} flagged in the scoring window.`
							: "Awaiting activation."}
					</CardContent>
				</Card>
			</section>

			<Card className="border-border bg-background">
				<CardHeader>
					<CardTitle className="text-base">Live analysis timeline</CardTitle>
					<CardDescription className="text-xs text-muted-foreground">
						Transactions, reason codes, and component scores returned by the
						Mimir API.
					</CardDescription>
				</CardHeader>
				<Separator />
				{events.length === 0 ? (
					<CardContent className="px-4 py-12 text-center text-sm text-muted-foreground">
						Activate live synthetic data to begin the timeline.
					</CardContent>
				) : (
					events.map((event) => (
						<CardContent
							key={event.id}
							className="border-t border-border px-4 py-4 first:border-t-0"
						>
							<div className="grid grid-cols-1 gap-4 xl:grid-cols-[170px_minmax(0,1fr)_260px]">
								<div>
									<div className="font-mono text-xs text-muted-foreground">
										{formatTime(event.createdAt)}
									</div>
									<div className="mt-2 font-mono text-xs text-muted-foreground">
										{event.transactionId}
									</div>
									<div className="mt-2 flex items-center gap-2">
										<RiskBadge level={event.riskLevel} />
										<span className="font-mono text-sm">
											{scorePercent(event.riskScore)}
										</span>
									</div>
								</div>

								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<div className="truncate text-sm font-medium">
											{event.merchantName}
										</div>
										<Badge variant="tag-rounded">
											{titleize(event.primaryPattern)}
										</Badge>
									</div>
									<div className="mt-1 text-xs text-muted-foreground">
										{event.cardId} / {titleize(event.merchantCategory)} /{" "}
										{event.channel} / {event.merchantCountry} / CAD{" "}
										{event.amount.toFixed(2)}
									</div>
									<ul className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">
										{event.reasons.map((reason) => (
											<li key={reason}>{reason}</li>
										))}
									</ul>
									<div className="mt-3 font-mono text-[10px] text-muted-foreground/70">
										{event.source}
									</div>
								</div>

								<div className="space-y-3">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground">Recommended</span>
										<span className="capitalize">
											{event.recommendedAction}
										</span>
									</div>
									{event.componentScores.map((score) => (
										<div key={score.label}>
											<div className="mb-1 flex items-center justify-between text-xs">
												<span className="text-muted-foreground">
													{score.label}
												</span>
												<span className="font-mono">
													{scorePercent(score.value)}
												</span>
											</div>
											<Progress
												value={Math.round(score.value * 100)}
												className="h-1.5 bg-muted [&>div]:bg-foreground/70"
											/>
										</div>
									))}
								</div>
							</div>
						</CardContent>
					))
				)}
			</Card>
		</main>
	);
}
