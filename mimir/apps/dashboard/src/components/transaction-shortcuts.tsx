"use client";

import { Icons } from "@midday/ui/icons";
import { toast } from "@midday/ui/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTransactionParams } from "@/hooks/use-transaction-params";
import { useTransactionsStore } from "@/store/transactions";
import { useTRPC } from "@/trpc/client";

type ReviewAction = "approve" | "dismiss" | "escalate";

type Props = {
	isFulfilled: boolean;
	reviewStatus?: string;
	status: string;
};

const REVIEW_ACTIONS: Array<{
	action: ReviewAction;
	key: string;
	label: string;
	toastTitle: string;
}> = [
	{
		action: "approve",
		key: "A",
		label: "Approve",
		toastTitle: "Flag approved",
	},
	{
		action: "escalate",
		key: "E",
		label: "Escalate",
		toastTitle: "Flag escalated",
	},
	{
		action: "dismiss",
		key: "I",
		label: "Ignore",
		toastTitle: "Flag ignored",
	},
];

export function TransactionShortcuts({
	isFulfilled,
	reviewStatus,
	status,
}: Props) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { transactionId, setParams } = useTransactionParams();
	const transactionIds = useTransactionsStore((s) => s.transactionIds);

	const updateTransactionMutation = useMutation(
		trpc.transactions.update.mutationOptions({
			onSuccess: (_, variables) => {
				queryClient.invalidateQueries({
					queryKey: trpc.transactions.get.infiniteQueryKey(),
				});
				queryClient.invalidateQueries({
					queryKey: trpc.transactions.getReviewCount.queryKey(),
				});

				if (transactionId) {
					queryClient.invalidateQueries({
						queryKey: trpc.transactions.getById.queryKey({ id: transactionId }),
					});
				}

				const action = (variables as { action?: ReviewAction }).action;
				const reviewAction = REVIEW_ACTIONS.find(
					({ action: reviewAction }) => reviewAction === action,
				);

				toast({
					title: reviewAction?.toastTitle ?? "Transaction updated",
					variant: "success",
				});
			},
		}),
	);

	const undoReviewMutation = useMutation(
		trpc.review.undo.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.transactions.get.infiniteQueryKey(),
				});
				queryClient.invalidateQueries({
					queryKey: trpc.transactions.getReviewCount.queryKey(),
				});

				toast({
					title: "Last review action undone",
					variant: "success",
				});
			},
		}),
	);

	const canToggleReviewReady =
		!isFulfilled && status !== "excluded" && status !== "archived";

	const isReviewReadyFromStatus = status === "completed" && !isFulfilled;

	const toggleReviewReady = async () => {
		if (!canToggleReviewReady || !transactionId) return;

		const currentIndex = transactionIds.indexOf(transactionId);
		const adjacentId =
			currentIndex !== -1
				? (transactionIds[currentIndex + 1] ?? transactionIds[currentIndex - 1])
				: undefined;

		await updateTransactionMutation.mutateAsync({
			id: transactionId,
			status: isReviewReadyFromStatus ? "posted" : "completed",
		});

		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.transactions.getById.queryKey({ id: transactionId }),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.transactions.get.infiniteQueryKey(),
			}),
		]);

		const updatedIds = queryClient
			.getQueriesData({
				queryKey: trpc.transactions.get.infiniteQueryKey(),
				type: "active",
			})
			// @ts-expect-error
			.flatMap(([, data]) => data?.pages ?? [])
			.flatMap((page) => page.data ?? [])
			.map((row) => row.id);

		if (!updatedIds.includes(transactionId)) {
			setParams(adjacentId ? { transactionId: adjacentId } : null);
		}
	};

	const getAdjacentTransactionId = useCallback(() => {
		if (!transactionId) return undefined;

		const currentIndex = transactionIds.indexOf(transactionId);

		return currentIndex !== -1
			? (transactionIds[currentIndex + 1] ?? transactionIds[currentIndex - 1])
			: undefined;
	}, [transactionId, transactionIds]);

	const applyReviewAction = useCallback(
		(action: ReviewAction) => {
			if (!transactionId || updateTransactionMutation.isPending) return;

			const adjacentId = getAdjacentTransactionId();

			updateTransactionMutation.mutate(
				{
					id: transactionId,
					action,
				} as Parameters<typeof updateTransactionMutation.mutate>[0],
				{
					onSuccess: () => {
						setParams(adjacentId ? { transactionId: adjacentId } : null);
					},
				},
			);
		},
		[
			getAdjacentTransactionId,
			setParams,
			transactionId,
			updateTransactionMutation,
		],
	);

	const navigate = (direction: "up" | "down") => {
		if (!transactionId) return;
		const currentIndex = transactionIds.indexOf(transactionId);
		if (currentIndex === -1) return;
		const nextId = transactionIds[currentIndex + (direction === "up" ? -1 : 1)];
		if (nextId) {
			setParams({ transactionId: nextId });
		}
	};

	const canReview =
		!!transactionId &&
		!updateTransactionMutation.isPending &&
		reviewStatus !== "blocked";

	useHotkeys(
		"meta+m",
		(event) => {
			event.preventDefault();
			toggleReviewReady();
		},
		{ enabled: !!transactionId },
	);

	useHotkeys(
		"a,e,i,d,u,enter,escape,ArrowUp,ArrowDown",
		(event) => {
			if (!transactionId) return;
			event.preventDefault();

			if (event.key === "a") {
				applyReviewAction("approve");
			} else if (event.key === "e") {
				applyReviewAction("escalate");
			} else if (event.key === "i" || event.key === "d") {
				applyReviewAction("dismiss");
			} else if (event.key === "u") {
				undoReviewMutation.mutate(undefined);
			} else if (event.key === "Enter" || event.key === "Escape") {
				setParams(null);
			} else if (event.key === "ArrowUp") {
				navigate("up");
			} else if (event.key === "ArrowDown") {
				navigate("down");
			}
		},
		{ enabled: !!transactionId },
	);

	return (
		<div className="absolute bottom-4 right-4 left-4 bg-[#FAFAF9] dark:bg-[#0C0C0C]">
			<div className="flex flex-col gap-3 border-t border-border pt-3">
				<div className="flex flex-wrap gap-2">
					{REVIEW_ACTIONS.map(({ action, key, label }) => (
						<button
							type="button"
							key={action}
							className="flex h-7 items-center gap-2 border border-border px-2 text-[#666] text-[10px] hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
							onClick={() => applyReviewAction(action)}
							disabled={!canReview}
							aria-label={`${label} transaction with ${key}`}
							title={
								action === "dismiss"
									? "Ignore transaction (I, D also works)"
									: `${label} transaction (${key})`
							}
						>
							<span className="font-mono">{key}</span>
							<span>{label}</span>
						</button>
					))}

					<button
						type="button"
						className="flex h-7 items-center gap-2 border border-border px-2 text-[#666] text-[10px] hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
						onClick={() => undoReviewMutation.mutate(undefined)}
						disabled={undoReviewMutation.isPending}
						aria-label="Undo last review action with U"
						title="Undo last review action (U)"
					>
						<span className="font-mono">U</span>
						<span>Undo</span>
					</button>
				</div>

				<div className="flex justify-between">
					{!isFulfilled && (
						<button
							type="button"
							className="flex items-center gap-2 cursor-pointer"
							onClick={toggleReviewReady}
							disabled={!canToggleReviewReady}
						>
							<span className="text-[10px] h-6 flex items-center justify-center text-[#666] border border-border px-2">
								⌘ M
							</span>
							<span className="text-[10px] text-[#666]">
								{isReviewReadyFromStatus ? "Unmark ready" : "Mark ready"}
							</span>
						</button>
					)}

					<div className="flex gap-2 ml-auto">
						<button
							type="button"
							className="flex h-6 w-6 items-center justify-center border border-border text-[#666] cursor-pointer hover:bg-accent"
							onClick={() => navigate("up")}
							aria-label="Previous transaction with Arrow Up"
							title="Previous transaction (Arrow Up)"
						>
							<Icons.ArrowUpward className="size-3.5" />
						</button>

						<button
							type="button"
							className="flex h-6 w-6 items-center justify-center border border-border text-[#666] cursor-pointer hover:bg-accent"
							onClick={() => navigate("down")}
							aria-label="Next transaction with Arrow Down"
							title="Next transaction (Arrow Down)"
						>
							<Icons.ArrowDownward className="size-3.5" />
						</button>

						<button
							type="button"
							className="flex items-center gap-2 cursor-pointer"
							onClick={() => setParams(null)}
							aria-label="Close transaction details with Escape"
							title="Close details (Esc)"
						>
							<span className="text-[10px] h-6 flex items-center justify-center text-[#666] border border-border px-2 hover:bg-accent">
								Esc
							</span>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
