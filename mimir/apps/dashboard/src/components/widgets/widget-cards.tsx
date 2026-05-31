"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useUserQuery } from "@/hooks/use-user";
import { useTRPC } from "@/trpc/client";
import { formatAmount, secondsToHoursAndMinutes } from "@/utils/format";

interface WidgetCardProps {
	label: string;
	href: string;
	value: string;
	detail?: string;
}

function WidgetCard({ label, href, value, detail }: WidgetCardProps) {
	return (
		<Link
			href={href}
			className="h-full border p-5 flex flex-col justify-between transition-all duration-300 bg-white border-[#e6e6e6] hover:bg-[#f7f7f7] hover:border-[#d0d0d0] dark:bg-[#0c0c0c] dark:border-[#1d1d1d] dark:hover:bg-[#0f0f0f] dark:hover:border-[#222222] cursor-pointer group min-h-[110px]"
		>
			<span className="text-xs text-muted-foreground">{label}</span>
			<div className="mt-3">
				<span className="text-xl font-medium">{value}</span>
				{detail ? (
					<span className="text-xs text-muted-foreground ml-2">{detail}</span>
				) : null}
			</div>
		</Link>
	);
}

export function WidgetCards() {
	const trpc = useTRPC();
	const { data } = useSuspenseQuery(trpc.overview.summary.queryOptions());
	const { data: user } = useUserQuery();
	const locale = user?.locale;

	const cashValue =
		formatAmount({
			amount: data.cashBalance.totalBalance,
			currency: data.cashBalance.currency,
			maximumFractionDigits: 0,
			locale,
		}) ?? "$0";

	const cashDetail =
		data.cashBalance.accountCount > 0
			? `${data.cashBalance.accountCount} ${data.cashBalance.accountCount === 1 ? "card" : "cards"} profiled`
			: undefined;

	const openValue = String(data.openInvoices.count);
	const openAmount = formatAmount({
		amount: data.openInvoices.totalAmount,
		currency: data.openInvoices.currency,
		maximumFractionDigits: 0,
		locale,
	});
	const openDetail =
		data.openInvoices.count > 0 ? `${openAmount} at risk` : "No critical flags";

	const hasUnbilledAmount = data.unbilledTime.totalAmount > 0;
	const unbilledTimeStr = secondsToHoursAndMinutes(
		data.unbilledTime.totalDuration,
	);
	const unbilledValue = hasUnbilledAmount
		? (formatAmount({
				amount: data.unbilledTime.totalAmount,
				currency: data.unbilledTime.currency,
				maximumFractionDigits: 0,
				locale,
			}) ?? unbilledTimeStr)
		: unbilledTimeStr;

	const unbilledDetail = hasUnbilledAmount
		? [
				`${data.unbilledTime.totalDuration} reviewed`,
				data.unbilledTime.projectCount > 0
					? `${data.unbilledTime.projectCount} ${data.unbilledTime.projectCount === 1 ? "pattern" : "patterns"}`
					: null,
			]
				.filter(Boolean)
				.join(" ")
		: data.unbilledTime.projectCount > 0
			? `${data.unbilledTime.projectCount} ${data.unbilledTime.projectCount === 1 ? "pattern" : "patterns"}`
			: undefined;

	const runwayValue = data.runway > 0 ? `${data.runway}` : "-";
	const runwayDetail =
		data.runway > 0 ? "active fraud patterns" : "No data yet";

	const reviewValue = String(data.transactionsToReview.count);
	const reviewDetail =
		data.transactionsToReview.count === 0 ? "Queue clear" : "Pending triage";

	const inboxValue = String(data.inboxPending.count);
	const inboxDetail =
		data.inboxPending.count === 0 ? "No live signals" : "Detector events";

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
			<WidgetCard
				label="Processed Volume"
				href="/reports?scrollTo=cash-balance"
				value={cashValue}
				detail={cashDetail}
			/>
			<WidgetCard
				label="Critical Flags"
				href="/transactions?tab=review&risk_level=critical"
				value={openValue}
				detail={openDetail}
			/>
			<WidgetCard
				label="Flagged Exposure"
				href="/transactions?tab=review"
				value={unbilledValue}
				detail={unbilledDetail}
			/>
			<WidgetCard
				label="Review Queue"
				href="/transactions?tab=review"
				value={reviewValue}
				detail={reviewDetail}
			/>
			<WidgetCard
				label="Risk Patterns"
				href="/reports?scrollTo=runway"
				value={runwayValue}
				detail={runwayDetail}
			/>
			<WidgetCard
				label="Live Feed"
				href="/transactions?tab=review"
				value={inboxValue}
				detail={inboxDetail}
			/>
		</div>
	);
}
