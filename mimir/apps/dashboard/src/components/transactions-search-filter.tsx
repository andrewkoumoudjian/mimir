"use client";

import { cn } from "@midday/ui/cn";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuPortal,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@midday/ui/dropdown-menu";
import { Icons } from "@midday/ui/icons";
import { Input } from "@midday/ui/input";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTransactionFilterParams } from "@/hooks/use-transaction-filter-params";
import { useTransactionFilterParamsWithPersistence } from "@/hooks/use-transaction-filter-params-with-persistence";
import { useTransactionTab } from "@/hooks/use-transaction-tab";
import { useTRPC } from "@/trpc/client";
import { formatAccountName } from "@/utils/format";
import { AmountRange } from "./amount-range";
import { DateRangeFilter } from "./date-range-filter";
import { FilterList } from "./filter-list";
import { SelectCategory } from "./select-category";

type StatusFilter =
	| "pending"
	| "approved"
	| "dismissed"
	| "escalated"
	| "declined"
	| "blocked";
type RiskLevelFilter = "low" | "medium" | "high" | "critical";
type ChannelFilter = "online" | "in_person" | "atm";

interface BaseFilterItem {
	name: string;
}

interface FilterItem<T extends string> extends BaseFilterItem {
	id: T;
}

interface FilterMenuItemProps {
	icon: (typeof Icons)[keyof typeof Icons];
	label: string;
	children: React.ReactNode;
}

interface FilterCheckboxItemProps {
	id: string;
	name: string;
	checked?: boolean;
	className?: string;
	onCheckedChange: () => void;
}

// Static data
const defaultSearch = {
	q: null,
	risk_level: null,
	review_status: null,
	card_id: null,
	merchant_name: null,
	merchant_category: null,
	channel: null,
	cardholder_country: null,
	merchant_country: null,
	device_id: null,
	ip_address: null,
	start: null,
	end: null,
	amount_range: null,
	score_range: null,
	signal: null,
};

const statusFilters: FilterItem<StatusFilter>[] = [
	{ id: "pending", name: "Pending review" },
	{ id: "approved", name: "Approved fraud" },
	{ id: "dismissed", name: "Dismissed" },
	{ id: "escalated", name: "Escalated" },
	{ id: "declined", name: "Declined" },
	{ id: "blocked", name: "Blocked" },
];

const riskLevelFilters: FilterItem<RiskLevelFilter>[] = [
	{ id: "critical", name: "Critical" },
	{ id: "high", name: "High" },
	{ id: "medium", name: "Medium" },
	{ id: "low", name: "Low" },
];

const channelFilters: FilterItem<ChannelFilter>[] = [
	{ id: "online", name: "Online" },
	{ id: "in_person", name: "In person" },
	{ id: "atm", name: "ATM" },
];

// Reusable components
function FilterMenuItem({ icon: Icon, label, children }: FilterMenuItemProps) {
	return (
		<DropdownMenuGroup>
			<DropdownMenuSub>
				<DropdownMenuSubTrigger>
					<Icon className="mr-2 size-4" />
					<span>{label}</span>
				</DropdownMenuSubTrigger>
				<DropdownMenuPortal>
					<DropdownMenuSubContent
						sideOffset={14}
						alignOffset={-4}
						className="p-0"
					>
						{children}
					</DropdownMenuSubContent>
				</DropdownMenuPortal>
			</DropdownMenuSub>
		</DropdownMenuGroup>
	);
}

function FilterCheckboxItem({
	id,
	name,
	checked = false,
	onCheckedChange,
	className,
}: FilterCheckboxItemProps) {
	return (
		<DropdownMenuCheckboxItem
			key={id}
			checked={checked}
			onCheckedChange={onCheckedChange}
			onSelect={(e) => e.preventDefault()}
			className={className}
		>
			{name}
		</DropdownMenuCheckboxItem>
	);
}

function useFilterData(isOpen: boolean, isFocused: boolean) {
	const trpc = useTRPC();
	const { filter } = useTransactionFilterParams();

	const shouldFetch = isOpen || isFocused;

	const { data: tagsData } = useQuery({
		...trpc.tags.get.queryOptions(),
		enabled: shouldFetch || Boolean(filter.signal?.length),
	});

	const { data: bankAccountsData } = useQuery({
		...trpc.bankAccounts.get.queryOptions({
			enabled: shouldFetch || Boolean(filter.card_id?.length),
		}),
	});

	// We want to fetch the categories data on mount
	const { data: categoriesData } = useQuery({
		...trpc.transactionCategories.get.queryOptions(),
	});

	return {
		tags: tagsData?.map((tag) => ({
			id: tag.id,
			name: tag.name,
		})),
		accounts: bankAccountsData?.map((bankAccount) => ({
			id: bankAccount.id,
			name: bankAccount.name ?? "",
			currency: bankAccount.currency ?? "",
		})),
		categories: categoriesData?.flatMap((category) => [
			// Include parent category
			{
				id: category.id,
				name: category.name,
				slug: category.slug,
			},
			// Include all child categories
			...(category.children?.map((child) => ({
				id: child.id,
				name: child.name,
				slug: child.slug,
			})) || []),
		]),
	};
}

function updateArrayFilter(
	value: string,
	currentValues: string[] | null | undefined,
	setFilter: (update: Record<string, unknown>) => void,
	key: string,
) {
	const normalizedValues = currentValues ?? null;
	const newValues = normalizedValues?.includes(value)
		? normalizedValues.filter((v) => v !== value).length > 0
			? normalizedValues.filter((v) => v !== value)
			: null
		: [...(normalizedValues ?? []), value];

	setFilter({ [key]: newValues });
}

export function TransactionsSearchFilter() {
	const { tab } = useTransactionTab();
	const inputRef = useRef<HTMLInputElement>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [isFocused, setIsFocused] = useState(false);
	const { filter = defaultSearch, setFilter } =
		useTransactionFilterParamsWithPersistence();
	const { tags, accounts, categories } = useFilterData(isOpen, isFocused);
	const [input, setInput] = useState(filter.q ?? "");

	useHotkeys(
		"esc",
		() => {
			setInput("");
			setFilter(defaultSearch);
			setIsOpen(false);
		},
		{
			enableOnFormTags: true,
			enabled: Boolean(input) && isFocused,
		},
	);

	useHotkeys("meta+s", (evt) => {
		evt.preventDefault();
		inputRef.current?.focus();
	});

	if (tab === "review") {
		return <h2 className="text-lg font-serif tracking-tight">Review queue</h2>;
	}

	const handleSearch = (evt: React.ChangeEvent<HTMLInputElement>) => {
		const value = evt.target.value;
		if (value) {
			setInput(value);
		} else {
			setFilter({ q: null });
			setInput("");
		}
	};

	const handleSubmit = (e?: React.FormEvent) => {
		e?.preventDefault();
		setFilter({ q: input.length > 0 ? input : null });
	};

	const validFilters = Object.fromEntries(
		Object.entries(filter).filter(([key]) => key !== "q"),
	);

	const hasValidFilters = Object.values(validFilters).some(
		(value) => value !== null,
	);

	const processFiltersForList = () => {
		const processed = {
			start: filter.start ?? undefined,
			end: filter.end ?? undefined,
			amount_range: filter.amount_range
				? `${filter.amount_range[0]}-${filter.amount_range[1]}`
				: undefined,
			score_range: filter.score_range
				? `${filter.score_range[0]}-${filter.score_range[1]}`
				: undefined,
			risk_level: filter.risk_level ?? undefined,
			review_status: filter.review_status ?? undefined,
			merchant_category: filter.merchant_category ?? undefined,
			signal: filter.signal ?? undefined,
			card_id: filter.card_id ?? undefined,
			channel: filter.channel ?? undefined,
		};

		// Filter out undefined and null values
		return Object.fromEntries(
			Object.entries(processed).filter(
				([_, value]) => value !== undefined && value !== null,
			),
		);
	};

	const getScoreRange = () => {
		if (
			!filter.score_range ||
			!Array.isArray(filter.score_range) ||
			filter.score_range.length < 2
		) {
			return undefined;
		}
		return [filter.score_range[0], filter.score_range[1]] as [number, number];
	};

	const getAmountRange = () => {
		if (
			!filter.amount_range ||
			!Array.isArray(filter.amount_range) ||
			filter.amount_range.length < 2
		) {
			return undefined;
		}
		return [filter.amount_range[0], filter.amount_range[1]] as [number, number];
	};

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<div className="flex flex-col sm:flex-row sm:space-x-4 space-y-2 sm:space-y-0 items-stretch sm:items-center w-full md:w-auto">
				<form
					className="relative flex-1 sm:flex-initial"
					onSubmit={(e) => {
						e.preventDefault();
						handleSubmit();
					}}
				>
					<Icons.Search className="absolute pointer-events-none left-3 top-[11px]" />
					<Input
						ref={inputRef}
						placeholder="Search transaction, card, merchant, IP..."
						className="pl-9 w-full sm:w-[350px] pr-8"
						value={input}
						onChange={handleSearch}
						onFocus={() => setIsFocused(true)}
						onBlur={() => setIsFocused(false)}
						autoComplete="off"
						autoCapitalize="none"
						autoCorrect="off"
						spellCheck="false"
					/>

					<DropdownMenuTrigger asChild>
						<button
							onClick={() => setIsOpen((prev) => !prev)}
							type="button"
							className={cn(
								"absolute z-10 right-3 top-[10px] opacity-50 transition-opacity duration-300 hover:opacity-100",
								hasValidFilters && "opacity-100",
								isOpen && "opacity-100",
							)}
						>
							<Icons.Filter />
						</button>
					</DropdownMenuTrigger>
				</form>

				<FilterList
					filters={processFiltersForList()}
					onRemove={setFilter}
					categories={categories}
					accounts={accounts}
					statusFilters={statusFilters}
					riskLevelFilters={riskLevelFilters}
					reviewStatusFilters={statusFilters}
					channelFilters={channelFilters}
					tags={tags}
					amountRange={getAmountRange()}
					scoreRange={getScoreRange()}
				/>
			</div>

			<DropdownMenuContent
				className="w-[350px]"
				align="end"
				sideOffset={19}
				alignOffset={-11}
				side="top"
			>
				<FilterMenuItem icon={Icons.CalendarMonth} label="Date">
					<DateRangeFilter
						start={filter.start}
						end={filter.end}
						onSelect={setFilter}
					/>
				</FilterMenuItem>

				<FilterMenuItem icon={Icons.Amount} label="Amount">
					<div className="w-[280px] p-4">
						<AmountRange />
					</div>
				</FilterMenuItem>

				<FilterMenuItem icon={Icons.Status} label="Risk level">
					{riskLevelFilters.map(({ id, name }) => (
						<FilterCheckboxItem
							key={id}
							id={id}
							name={name}
							checked={filter?.risk_level?.includes(id)}
							onCheckedChange={() =>
								updateArrayFilter(
									id,
									filter.risk_level,
									setFilter,
									"risk_level",
								)
							}
						/>
					))}
				</FilterMenuItem>

				<FilterMenuItem icon={Icons.Status} label="Review status">
					{statusFilters.map(({ id, name }) => (
						<FilterCheckboxItem
							key={id}
							id={id}
							name={name}
							checked={filter?.review_status?.includes(id)}
							onCheckedChange={() =>
								updateArrayFilter(
									id,
									filter.review_status,
									setFilter,
									"review_status",
								)
							}
						/>
					))}
				</FilterMenuItem>

				<FilterMenuItem icon={Icons.Category} label="Merchant category">
					<div className="w-[250px] h-[270px]">
						<SelectCategory
							headless
							onChange={(selected) =>
								updateArrayFilter(
									selected.slug,
									filter.merchant_category,
									setFilter,
									"merchant_category",
								)
							}
						/>
					</div>
				</FilterMenuItem>

				<FilterMenuItem icon={Icons.Status} label="Signal">
					<div className="max-h-[400px] overflow-y-auto">
						{tags && tags.length > 0 ? (
							tags.map((tag) => (
								<FilterCheckboxItem
									key={tag.id}
									id={tag.id}
									name={tag.name}
									checked={filter?.signal?.includes(tag.id)}
									onCheckedChange={() =>
										updateArrayFilter(
											tag.id,
											filter.signal,
											setFilter,
											"signal",
										)
									}
								/>
							))
						) : (
							<p className="text-sm text-[#878787] px-2">No signals found</p>
						)}
					</div>
				</FilterMenuItem>

				<FilterMenuItem icon={Icons.Accounts} label="Card">
					{accounts?.map((account) => (
						<FilterCheckboxItem
							key={account.id}
							id={account.id}
							name={formatAccountName({
								name: account.name,
								currency: account.currency,
							})}
							checked={filter?.card_id?.includes(account.id)}
							onCheckedChange={() =>
								updateArrayFilter(
									account.id,
									filter.card_id,
									setFilter,
									"card_id",
								)
							}
						/>
					))}
				</FilterMenuItem>

				<FilterMenuItem icon={Icons.Import} label="Channel">
					{channelFilters.map(({ id, name }) => (
						<FilterCheckboxItem
							key={id}
							id={id}
							name={name}
							checked={filter?.channel?.includes(id)}
							onCheckedChange={() =>
								updateArrayFilter(id, filter.channel, setFilter, "channel")
							}
						/>
					))}
				</FilterMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
