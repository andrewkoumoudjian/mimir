"use client";

import type { RouterOutputs } from "@api/trpc/routers/_app";
import { Badge } from "@midday/ui/badge";
import { Button } from "@midday/ui/button";
import { Checkbox } from "@midday/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@midday/ui/dropdown-menu";
import { Icons } from "@midday/ui/icons";
import { Spinner } from "@midday/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@midday/ui/tooltip";
import { formatDate } from "@midday/utils/format";
import type { ColumnDef } from "@tanstack/react-table";
import { memo, useCallback } from "react";
import { FormatAmount } from "@/components/format-amount";
import { InlineAssignUser } from "@/components/inline-assign-user";
import { InlineSelectCategory } from "@/components/inline-select-category";
import { InlineSelectTags } from "@/components/inline-select-tags";
import { TransactionBankAccount } from "@/components/transaction-bank-account";
import { TransactionMethod } from "@/components/transaction-method";

type Transaction = RouterOutputs["transactions"]["get"]["data"][number];
type FraudTransaction = Transaction & {
	riskScore?: number;
	riskLevel?: "low" | "medium" | "high" | "critical";
	reasonCount?: number;
	reviewStatus?: string;
	primaryPattern?: string;
	merchantName?: string;
	merchantCategory?: string;
	cardId?: string;
	channel?: string;
	xfraudGraphScore?: number;
};

const SelectCell = memo(
	({
		checked,
		onChange,
		onShiftClick,
	}: {
		checked: boolean;
		onChange: (value: boolean) => void;
		onShiftClick?: () => void;
	}) => (
		<div
			onClick={(e) => {
				if (e.shiftKey && onShiftClick) {
					e.preventDefault();
					e.stopPropagation();
					onShiftClick();
				}
			}}
		>
			<Checkbox checked={checked} onCheckedChange={onChange} />
		</div>
	),
);

SelectCell.displayName = "SelectCell";

const DateCell = memo(
	({ date, format }: { date: string; format?: string | null }) =>
		formatDate(date, format),
);

DateCell.displayName = "DateCell";

const DescriptionCell = memo(
	({
		name,
		description,
		status,
	}: {
		name: string;
		description?: string;
		status?: string;
	}) => (
		<div className="flex items-center space-x-2">
			<Tooltip>
				<TooltipTrigger asChild>
					<span>
						<div className="flex space-x-2 items-center">
							<span className="line-clamp-1 text-ellipsis max-w-[100px] md:max-w-none">
								{name}
							</span>

							{status === "completed" && (
								<div className="flex space-x-1 items-center border rounded-md text-[10px] py-1 px-2 h-[22px] text-[#878787]">
									<span>Pending review</span>
								</div>
							)}
						</div>
					</span>
				</TooltipTrigger>

				{description && (
					<TooltipContent
						className="px-3 py-1.5 text-xs max-w-[380px]"
						side="right"
						sideOffset={10}
					>
						{description}
					</TooltipContent>
				)}
			</Tooltip>
		</div>
	),
);

DescriptionCell.displayName = "DescriptionCell";

const AmountCell = memo(
	({ amount, currency }: { amount: number; currency: string }) => (
		<span className="text-sm">
			<FormatAmount amount={amount} currency={currency} />
		</span>
	),
);

AmountCell.displayName = "AmountCell";

const RiskScoreCell = memo(({ score }: { score?: number }) => {
	if (score == null) {
		return <span className="text-muted-foreground">-</span>;
	}

	return (
		<span className="font-medium tabular-nums">{Math.round(score * 100)}</span>
	);
});

RiskScoreCell.displayName = "RiskScoreCell";

const RiskLevelCell = memo(({ level }: { level?: string }) => {
	if (!level) {
		return <span className="text-muted-foreground">-</span>;
	}

	return (
		<Badge variant="tag-rounded" className="whitespace-nowrap capitalize">
			{level}
		</Badge>
	);
});

RiskLevelCell.displayName = "RiskLevelCell";

const ReviewStatusCell = memo(({ status }: { status?: string }) => (
	<span className="capitalize text-muted-foreground">
		{status?.replace(/_/g, " ") ?? "pending"}
	</span>
));

ReviewStatusCell.displayName = "ReviewStatusCell";

const TagsCell = memo(
	({ tags }: { tags?: { id: string; name: string | null }[] }) => (
		<div className="relative w-full">
			<div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
				{tags?.map(({ id, name }) => (
					<Badge
						key={id}
						variant="tag-rounded"
						className="whitespace-nowrap flex-shrink-0"
					>
						{name}
					</Badge>
				))}
			</div>
			<div className="group-hover:hidden right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none z-10" />
		</div>
	),
);

TagsCell.displayName = "TagsCell";

const ActionsCell = memo(
	({
		transaction,
		onViewDetails,
		onCopyUrl,
		onUpdateTransaction,
		onDeleteTransaction,
		onEditTransaction,
		onMoveToReview,
	}: {
		transaction: Transaction;
		onViewDetails?: (id: string) => void;
		onCopyUrl?: (id: string) => void;
		onUpdateTransaction?: (data: {
			id: string;
			status?: string;
			categorySlug?: string | null;
			assignedId?: string | null;
		}) => void;
		onDeleteTransaction?: (id: string) => void;
		onEditTransaction?: (id: string) => void;
		onMoveToReview?: (id: string) => void;
	}) => {
		const handleViewDetails = useCallback(() => {
			onViewDetails?.(transaction.id);
		}, [transaction.id, onViewDetails]);

		const handleEditTransaction = useCallback(() => {
			onEditTransaction?.(transaction.id);
		}, [transaction.id, onEditTransaction]);

		const handleCopyUrl = useCallback(() => {
			onCopyUrl?.(transaction.id);
		}, [transaction.id, onCopyUrl]);

		const handleDismissFlag = useCallback(() => {
			onUpdateTransaction?.({ id: transaction.id, status: "excluded" });
		}, [transaction.id, onUpdateTransaction]);

		const handleUpdateToExported = useCallback(() => {
			onUpdateTransaction?.({ id: transaction.id, status: "exported" });
		}, [transaction.id, onUpdateTransaction]);

		const handleDeleteTransaction = useCallback(() => {
			onDeleteTransaction?.(transaction.id);
		}, [transaction.id, onDeleteTransaction]);

		const handleMoveToReview = useCallback(() => {
			onMoveToReview?.(transaction.id);
		}, [transaction.id, onMoveToReview]);

		return (
			<div className="flex justify-center w-full">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="h-8 w-8 p-0">
							<span className="sr-only">Open menu</span>
							<Icons.MoreHoriz className="text-muted-foreground" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={handleViewDetails}>
							View evidence
						</DropdownMenuItem>
						{transaction.manual && (
							<DropdownMenuItem onClick={handleEditTransaction}>
								Edit
							</DropdownMenuItem>
						)}
						<DropdownMenuItem onClick={handleCopyUrl}>
							Copy link
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={handleUpdateToExported}>
							Approve flag
						</DropdownMenuItem>
						<DropdownMenuItem onClick={handleDismissFlag}>
							Dismiss flag
						</DropdownMenuItem>
						<DropdownMenuItem onClick={handleMoveToReview}>
							Escalate
						</DropdownMenuItem>

						{transaction.manual && (
							<DropdownMenuItem
								className="text-destructive"
								onClick={handleDeleteTransaction}
							>
								Delete
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		);
	},
);

ActionsCell.displayName = "ActionsCell";

export const columns: ColumnDef<Transaction>[] = [
	{
		id: "select",
		size: 50,
		minSize: 50,
		maxSize: 50,
		enableResizing: false,
		meta: {
			sticky: true,
			skeleton: { type: "checkbox" },
			className:
				"w-[50px] min-w-[50px] md:sticky md:left-[var(--stick-left)] bg-background group-hover:bg-[#F2F1EF] group-hover:dark:bg-[#0f0f0f] z-10",
		},
		cell: ({ row, table }) => {
			const meta = table.options.meta;
			const rows = table.getRowModel().rows;
			const rowIndex = rows.findIndex((r) => r.id === row.id);
			const handleShiftClick = () => {
				if (
					meta?.lastClickedIndex !== null &&
					meta?.lastClickedIndex !== undefined &&
					meta?.handleShiftClickRange
				) {
					meta.handleShiftClickRange(meta.lastClickedIndex, rowIndex);
				}
				if (meta?.setLastClickedIndex) {
					meta.setLastClickedIndex(rowIndex);
				}
			};

			return (
				<SelectCell
					checked={row.getIsSelected()}
					onChange={(value) => {
						row.toggleSelected(!!value);
						if (meta?.setLastClickedIndex) {
							meta.setLastClickedIndex(rowIndex);
						}
					}}
					onShiftClick={handleShiftClick}
				/>
			);
		},
		enableSorting: false,
		enableHiding: false,
	},
	{
		accessorKey: "date",
		header: "Date",
		size: 110,
		minSize: 110,
		maxSize: 110,
		enableResizing: false,
		meta: {
			sticky: true,
			skeleton: { type: "text", width: "w-16" },
			headerLabel: "Date",
			className:
				"w-[110px] min-w-[110px] md:sticky md:left-[var(--stick-left)] bg-background group-hover:bg-[#F2F1EF] group-hover:dark:bg-[#0f0f0f] z-10",
		},
		cell: ({ row, table }) => (
			<DateCell
				date={row.original.date}
				format={table.options.meta?.dateFormat}
			/>
		),
	},
	{
		accessorKey: "description",
		header: "Description",
		size: 320,
		minSize: 200,
		maxSize: 600,
		enableResizing: true,
		meta: {
			sticky: true,
			skeleton: { type: "text", width: "w-40" },
			headerLabel: "Description",
			className:
				"w-[320px] min-w-[200px] md:sticky md:left-[var(--stick-left)] bg-background group-hover:bg-[#F2F1EF] group-hover:dark:bg-[#0f0f0f] z-10",
		},
		cell: ({ row }) => (
			<DescriptionCell
				name={row.original.name}
				description={row.original.description ?? undefined}
				status={row.original.status ?? undefined}
			/>
		),
	},
	{
		accessorKey: "amount",
		header: "Amount (CAD)",
		size: 170,
		minSize: 100,
		maxSize: 400,
		enableResizing: true,
		meta: {
			skeleton: { type: "text", width: "w-20" },
			headerLabel: "Amount (CAD)",
			className: "w-[170px] min-w-[100px]",
		},
		cell: ({ row }) => (
			<AmountCell
				amount={row.original.amount}
				currency={row.original.currency}
			/>
		),
	},
	{
		accessorKey: "taxAmount",
		header: "Risk Score",
		size: 170,
		minSize: 100,
		maxSize: 400,
		enableResizing: true,
		meta: {
			skeleton: { type: "text", width: "w-24" },
			headerLabel: "Risk Score",
			className: "w-[170px] min-w-[100px]",
		},
		cell: ({ row }) => (
			<RiskScoreCell score={(row.original as FraudTransaction).riskScore} />
		),
	},
	{
		accessorKey: "baseAmount",
		header: "Reasons",
		size: 170,
		minSize: 100,
		maxSize: 400,
		enableResizing: true,
		meta: {
			skeleton: { type: "text", width: "w-20" },
			headerLabel: "Reasons",
			className: "w-[170px] min-w-[100px]",
		},
		cell: ({ row }) => {
			const reasonCount = (row.original as FraudTransaction).reasonCount ?? 0;
			return <span className="tabular-nums">{reasonCount}</span>;
		},
	},
	{
		accessorKey: "baseTaxAmount",
		header: "Risk Level",
		size: 170,
		minSize: 100,
		maxSize: 400,
		enableResizing: true,
		meta: {
			skeleton: { type: "text", width: "w-20" },
			headerLabel: "Risk Level",
			className: "w-[170px] min-w-[100px]",
		},
		cell: ({ row }) => {
			const level = (row.original as FraudTransaction).riskLevel;
			return <RiskLevelCell level={level} />;
		},
	},
	{
		accessorKey: "category",
		header: "Merchant Category",
		size: 250,
		minSize: 150,
		maxSize: 400,
		enableResizing: true,
		meta: {
			skeleton: { type: "icon-text", width: "w-28" },
			headerLabel: "Merchant Category",
			className: "w-[250px] min-w-[150px]",
		},
		cell: ({ row, table }) => {
			// Show analyzing state when enrichment is not completed
			if (!row.original.enrichmentCompleted) {
				return (
					<Tooltip>
						<TooltipTrigger asChild>
							<div className="flex items-center space-x-2 cursor-help">
								<Spinner size={14} className="stroke-primary" />
								<span className="text-[#878787] text-sm">Scoring</span>
							</div>
						</TooltipTrigger>
						<TooltipContent
							className="px-3 py-1.5 text-xs max-w-[280px]"
							side="top"
							sideOffset={5}
						>
							Scoring transaction details against card baselines and shared
							signals.
						</TooltipContent>
					</Tooltip>
				);
			}

			const meta = table.options.meta;

			return (
				<InlineSelectCategory
					selected={
						row.original.category
							? {
									id: row.original.category.id,
									name: row.original.category.name,
									color: row.original.category.color,
									slug: row.original.category.slug ?? "",
								}
							: undefined
					}
					onChange={(category) => {
						meta?.updateTransaction?.({
							id: row.original.id,
							categorySlug: category.slug,
							categoryName: category.name,
						});
					}}
				/>
			);
		},
	},
	{
		accessorKey: "counterparty",
		header: "Merchant",
		size: 200,
		minSize: 120,
		maxSize: 400,
		enableResizing: true,
		meta: {
			skeleton: { type: "text", width: "w-28" },
			headerLabel: "Merchant",
			className: "w-[200px] min-w-[120px]",
		},
		cell: ({ row }) => (
			<span className="text-muted-foreground">
				{(row.original as FraudTransaction).merchantName ??
					row.original.counterpartyName ??
					"-"}
			</span>
		),
	},
	{
		accessorKey: "tags",
		header: "Risk Signals",
		size: 280,
		minSize: 150,
		maxSize: 500,
		enableResizing: true,
		meta: {
			skeleton: { type: "tags" },
			headerLabel: "Risk Signals",
			className: "w-[280px] min-w-[150px]",
		},
		cell: ({ row }) => (
			<InlineSelectTags
				transactionId={row.original.id}
				tags={row.original.tags}
			/>
		),
	},
	{
		accessorKey: "bank_account",
		header: "Card",
		size: 250,
		minSize: 150,
		maxSize: 400,
		enableResizing: true,
		meta: {
			skeleton: { type: "avatar-text", width: "w-32" },
			headerLabel: "Card",
			className: "w-[250px] min-w-[150px]",
		},
		cell: ({ row }) => (
			<TransactionBankAccount
				name={row.original?.account?.name ?? undefined}
				logoUrl={row.original?.account?.connection?.logoUrl ?? undefined}
			/>
		),
	},
	{
		accessorKey: "method",
		header: "Channel",
		size: 140,
		minSize: 100,
		maxSize: 300,
		enableResizing: true,
		meta: {
			skeleton: { type: "text", width: "w-16" },
			headerLabel: "Channel",
			className: "w-[140px] min-w-[100px]",
		},
		cell: ({ row }) => <TransactionMethod method={row.original.method} />,
	},
	{
		accessorKey: "assigned",
		header: "Assigned",
		size: 220,
		minSize: 150,
		maxSize: 400,
		enableResizing: true,
		meta: {
			skeleton: { type: "avatar-text", width: "w-24" },
			headerLabel: "Assigned",
			className: "w-[220px] min-w-[150px]",
		},
		cell: ({ row, table }) => {
			const meta = table.options.meta;

			return (
				<InlineAssignUser
					selectedId={row.original.assigned?.id ?? undefined}
					onSelect={(user) => {
						meta?.updateTransaction?.({
							id: row.original.id,
							assignedId: user.id,
						});
					}}
				/>
			);
		},
	},
	{
		accessorKey: "status",
		header: "Review",
		size: 160,
		minSize: 120,
		maxSize: 300,
		enableResizing: true,
		meta: {
			skeleton: { type: "badge", width: "w-20" },
			headerLabel: "Review",
			className: "w-[160px] min-w-[120px]",
		},
		cell: ({ row, table }) => {
			const meta = table.options.meta;

			// Show exporting state when transaction is being exported
			if (meta?.exportingTransactionIds?.includes(row.original.id)) {
				return (
					<div className="flex items-center space-x-2">
						<Spinner size={14} className="stroke-primary" />
						<span className="text-[#878787] text-sm">Exporting</span>
					</div>
				);
			}

			return (
				<ReviewStatusCell
					status={(row.original as FraudTransaction).reviewStatus}
				/>
			);
		},
	},
	{
		id: "actions",
		size: 100,
		minSize: 100,
		maxSize: 100,
		enableResizing: false,
		enableSorting: false,
		enableHiding: false,
		meta: {
			sticky: true,
			skeleton: { type: "icon" },
			headerLabel: "Actions",
			className:
				"w-[100px] min-w-[100px] md:sticky md:right-0 bg-background group-hover:bg-[#F2F1EF] group-hover:dark:bg-[#0f0f0f] z-10 justify-center !border-l !border-border",
		},
		cell: ({ row, table }) => {
			const meta = table.options.meta;

			return (
				<ActionsCell
					transaction={row.original}
					onViewDetails={meta?.setOpen}
					onCopyUrl={meta?.copyUrl}
					onUpdateTransaction={meta?.updateTransaction}
					onDeleteTransaction={meta?.onDeleteTransaction}
					onEditTransaction={meta?.editTransaction}
					onMoveToReview={meta?.moveToReview}
				/>
			);
		},
	},
];
