"use client";

import { Icons } from "@midday/ui/icons";
import Link from "next/link";
import { useInboxUpload } from "@/hooks/use-inbox-upload";

const CHAT_ACTIONS = [
	{
		label: "Review queue",
		icon: Icons.Transactions,
		href: "/transactions?tab=review",
	},
	{
		label: "Run detector",
		icon: Icons.CreateTransaction,
		href: "/transactions?step=import&hide=true",
	},
	{
		label: "Export CSV",
		icon: Icons.Customers,
		href: "/invoices",
	},
	{
		label: "Tune cost",
		icon: Icons.Tracker,
		href: "/settings/billing",
	},
] as const;

const buttonClassName =
	"flex items-center gap-1.5 border bg-white border-[#e6e6e6] hover:bg-[#f7f7f7] hover:border-[#d0d0d0] dark:border-[#1d1d1d] dark:bg-[#0c0c0c] dark:hover:bg-[#0f0f0f] dark:hover:border-[#222222] px-3 py-1.5 text-xs text-muted-foreground/60 hover:text-foreground transition-all duration-300 cursor-pointer group";

const iconClassName =
	"text-muted-foreground/40 group-hover:text-foreground transition-colors duration-300";

export function QuickActions(_: { onChatOpen: () => void }) {
	const { openFilePicker } = useInboxUpload();

	return (
		<div className="flex items-center justify-center gap-3 pt-2 pb-12 w-full flex-wrap">
			{CHAT_ACTIONS.map(({ label, icon: Icon, href }) => (
				<Link
					key={label}
					href={href}
					data-track="Assistant Quick Action"
					data-action={label}
					className={buttonClassName}
				>
					<Icon size={13} className={iconClassName} />
					<span>{label}</span>
				</Link>
			))}

			<button
				type="button"
				data-track="Assistant Quick Action"
				data-action="Upload CSV"
				className={buttonClassName}
				onClick={openFilePicker}
			>
				<Icons.Inbox2 size={13} className={iconClassName} />
				<span>Upload CSV</span>
			</button>
		</div>
	);
}
