"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUserQuery } from "@/hooks/use-user";
import { useTRPC } from "@/trpc/client";
import { formatAmount, secondsToHoursAndMinutes } from "@/utils/format";

type Insight = {
	key: string;
	before: string;
	link: string;
	after: string;
	href: string;
};

const linkClass =
	"border-b border-dashed border-[#878787]/30 hover:text-foreground transition-colors";

type SummaryData = {
	openInvoices: { count: number; totalAmount: number; currency: string };
	unbilledTime: {
		totalDuration: number;
		totalAmount: number;
		projectCount: number;
		currency: string;
	};
	inboxPending: { count: number };
	transactionsToReview: { count: number };
	cashBalance: { totalBalance: number; currency: string; accountCount: number };
	runway: number;
};

function buildInsights(data: SummaryData, locale?: string | null): Insight[] {
	const insights: Insight[] = [];

	if (data.openInvoices.count > 0) {
		const amount = formatAmount({
			amount: data.openInvoices.totalAmount,
			currency: data.openInvoices.currency,
			maximumFractionDigits: 0,
			locale,
		});
		insights.push({
			key: "critical",
			href: "/transactions?tab=review&risk_level=critical",
			before: "There are ",
			link: `${data.openInvoices.count} critical ${data.openInvoices.count === 1 ? "flag" : "flags"}`,
			after: ` representing ${amount} in flagged exposure.`,
		});
	}

	if (data.unbilledTime.totalAmount > 0) {
		const label =
			data.unbilledTime.totalAmount > 0
				? formatAmount({
						amount: data.unbilledTime.totalAmount,
						currency: data.unbilledTime.currency,
						maximumFractionDigits: 0,
						locale,
					})
				: secondsToHoursAndMinutes(data.unbilledTime.totalDuration);
		const projectSuffix =
			data.unbilledTime.projectCount > 0
				? ` across ${data.unbilledTime.projectCount} ${data.unbilledTime.projectCount === 1 ? "pattern" : "patterns"}`
				: "";
		insights.push({
			key: "exposure",
			href: "/transactions?tab=review",
			before: "The review queue carries ",
			link: `${label} of exposure`,
			after: `${projectSuffix}.`,
		});
	}

	if (data.cashBalance.totalBalance > 0) {
		const amount = formatAmount({
			amount: data.cashBalance.totalBalance,
			currency: data.cashBalance.currency,
			maximumFractionDigits: 0,
			locale,
		});
		const accountSuffix =
			data.cashBalance.accountCount > 1
				? ` across ${data.cashBalance.accountCount} accounts`
				: "";
		insights.push({
			key: "processed",
			href: "/transactions",
			before: "Mimir processed ",
			link: `${amount} in transaction volume`,
			after: `${accountSuffix}.`,
		});
	}

	if (data.runway > 0) {
		insights.push({
			key: "patterns",
			href: "/reports?scrollTo=runway",
			before: "The detector is tracking ",
			link: `${data.runway} active ${data.runway === 1 ? "pattern" : "patterns"}`,
			after: " across card baselines and shared entities.",
		});
	}

	if (data.transactionsToReview.count > 0) {
		insights.push({
			key: "transactions",
			href: "/transactions?tab=review",
			before: "You have ",
			link: `${data.transactionsToReview.count} ${data.transactionsToReview.count === 1 ? "transaction" : "transactions"}`,
			after: " waiting for approve, dismiss, or escalate.",
		});
	}

	if (data.inboxPending.count > 0) {
		insights.push({
			key: "feed",
			href: "/transactions?tab=review",
			before: "The live feed has ",
			link: `${data.inboxPending.count} ${data.inboxPending.count === 1 ? "flag" : "flags"}`,
			after: " from the current detector run.",
		});
	}

	if (insights.length === 0) {
		insights.push({
			key: "clear",
			href: "#",
			before: "",
			link: "",
			after: "The queue is clear. New detector signals will appear here.",
		});
	}

	return insights;
}

const TICK_DURATION = 6000;

function SummaryTicker({ insights }: { insights: Insight[] }) {
	const [index, setIndex] = useState(0);
	const [direction, setDirection] = useState(1);
	const [fast, setFast] = useState(false);
	const [progress, setProgress] = useState(0);
	const hoveredRef = useRef(false);
	const startRef = useRef(Date.now());
	const elapsedOnPauseRef = useRef(0);

	const goTo = useCallback(
		(i: number) => {
			const next = i % insights.length;
			if (next === index) return;
			setFast(true);
			setDirection(next > index ? 1 : -1);
			setIndex(next);
			setProgress(0);
			startRef.current = Date.now();
			elapsedOnPauseRef.current = 0;
		},
		[insights.length, index],
	);

	useEffect(() => {
		if (insights.length <= 1) return;

		let raf: number;

		const tick = () => {
			if (hoveredRef.current) {
				raf = requestAnimationFrame(tick);
				return;
			}

			const elapsed =
				elapsedOnPauseRef.current + (Date.now() - startRef.current);
			const pct = Math.min(elapsed / TICK_DURATION, 1);
			setProgress(pct);

			if (pct >= 1) {
				setFast(false);
				setDirection(1);
				setIndex((prev) => (prev + 1) % insights.length);
				setProgress(0);
				startRef.current = Date.now();
				elapsedOnPauseRef.current = 0;
			}

			raf = requestAnimationFrame(tick);
		};

		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [insights.length]);

	const current = insights[index % insights.length]!;
	const slideY = (fast ? 8 : 14) * direction;
	const duration = fast ? 0.12 : 0.32;

	if (insights.length <= 1) {
		return (
			<p className="text-muted-foreground text-sm mt-3 max-w-lg leading-relaxed text-center">
				{current.before}
				{current.link && (
					<Link href={current.href} className={linkClass}>
						{current.link}
					</Link>
				)}
				{current.after}
			</p>
		);
	}

	return (
		<div
			className="flex flex-col items-center max-w-lg w-full gap-3"
			onMouseEnter={() => {
				hoveredRef.current = true;
				elapsedOnPauseRef.current += Date.now() - startRef.current;
			}}
			onMouseLeave={() => {
				hoveredRef.current = false;
				startRef.current = Date.now();
			}}
		>
			<div className="relative h-10 overflow-hidden w-full">
				<AnimatePresence mode="wait" initial={false} custom={direction}>
					<motion.div
						key={current.key}
						className="absolute inset-0 flex items-center justify-center"
						initial={{ y: slideY, opacity: 0, filter: "blur(4px)" }}
						animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
						exit={{ y: -slideY, opacity: 0, filter: "blur(4px)" }}
						transition={{ duration, ease: [0.16, 1, 0.3, 1] }}
					>
						<span className="text-muted-foreground text-sm leading-relaxed text-center">
							{current.before}
							{current.link && (
								<Link href={current.href} className={linkClass}>
									{current.link}
								</Link>
							)}
							{current.after}
						</span>
					</motion.div>
				</AnimatePresence>
			</div>

			<div className="flex items-center gap-1.5">
				{insights.map((insight, i) => (
					<button
						key={insight.key}
						type="button"
						className="group/bar relative cursor-pointer py-2 -my-2"
						onClick={() => goTo(i)}
						onMouseEnter={() => goTo(i)}
					>
						<div className="relative h-[2px] w-4 rounded-full bg-primary/10 overflow-hidden">
							<div
								className="absolute inset-0 bg-primary/40 rounded-full origin-left group-hover/bar:!scale-x-100"
								style={{
									transform: `scaleX(${i === index ? progress : 0})`,
								}}
							/>
						</div>
					</button>
				))}
			</div>
		</div>
	);
}

export function WelcomeGreeting() {
	return (
		<h1 className="text-[38px] font-serif leading-tight text-center">
			Fraud command <span className="text-muted-foreground">center</span>
		</h1>
	);
}

export function WelcomeSummary() {
	const { data: user } = useUserQuery();
	const trpc = useTRPC();
	const { data } = useSuspenseQuery(trpc.overview.summary.queryOptions());
	const insights = buildInsights(data, user?.locale);

	return <SummaryTicker insights={insights} />;
}
