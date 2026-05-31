import { Icons } from "@midday/ui/icons";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@midday/ui/tooltip";
import { format } from "date-fns";

const ERROR_MESSAGES: Record<string, string> = {
	FINANCIAL_YEAR_MISSING: "Review export period is not configured",
	FINANCIAL_YEAR_SETUP_REQUIRED:
		"Please configure the review export period first",
	AUTH_EXPIRED: "Connection expired — please reconnect the review destination",
	RATE_LIMIT: "Too many requests — will retry automatically",
	VALIDATION: "Invalid data format",
	NOT_FOUND: "Resource not found in the review destination",
	SERVER_ERROR: "Review destination is temporarily unavailable",
	ATTACHMENT_UNSUPPORTED_TYPE: "Attachment file type not supported",
	ATTACHMENT_TOO_LARGE: "Attachment file is too large",
	ATTACHMENT_TIMEOUT: "Attachment upload timed out",
	ATTACHMENT_UPLOAD_FAILED: "Failed to upload attachment",
	ATTACHMENT_NOT_FOUND: "Attachment file not found",
	UNKNOWN: "An unexpected error occurred",
};

const PROVIDER_NAMES: Record<string, string> = {
	xero: "Review archive",
	quickbooks: "Case system",
	fortnox: "Compliance store",
};

const PROVIDER_ICONS: Record<string, React.FC<{ className?: string }>> = {
	xero: Icons.Xero,
	quickbooks: Icons.QuickBooks,
	fortnox: Icons.Fortnox,
};

function getErrorMessage(code?: string | null): string {
	if (!code) return ERROR_MESSAGES.UNKNOWN as string;
	return (ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN) as string;
}

function getProviderName(provider?: string | null): string {
	if (!provider) return "review destination";
	return (PROVIDER_NAMES[provider] ?? provider) as string;
}

function formatExportDate(dateStr?: string | null): string {
	if (!dateStr) return "";
	try {
		return format(new Date(dateStr), "MMM d, yyyy, h:mm a");
	} catch {
		return dateStr;
	}
}

type Props = {
	rawStatus?: string | null;
	isFulfilled: boolean;
	isExported: boolean;
	hasExportError?: boolean;
	exportErrorCode?: string | null;
	exportProvider?: string | null;
	exportedAt?: string | null;
	hasPendingSuggestion?: boolean;
};

export function TransactionStatus({
	rawStatus,
	isFulfilled,
	isExported,
	hasExportError,
	exportErrorCode,
	exportProvider,
	exportedAt,
	hasPendingSuggestion,
}: Props) {
	if (rawStatus === "archived") {
		return <span className="cursor-default text-[#878787]">Escalated</span>;
	}

	if (rawStatus === "excluded") {
		return <span className="cursor-default text-[#878787]">Dismissed</span>;
	}

	if (hasExportError && !isExported) {
		return (
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<span style={{ color: "#f44336" }} className="cursor-default">
							Review export failed
						</span>
					</TooltipTrigger>
					<TooltipContent sideOffset={10} className="text-xs">
						<p>{getErrorMessage(exportErrorCode)}</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	if (isFulfilled && !isExported) {
		return (
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="cursor-default">Pending review</span>
					</TooltipTrigger>
					<TooltipContent sideOffset={10} className="text-xs">
						<p>Flagged and waiting for reviewer decision.</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	if (hasPendingSuggestion) {
		return (
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<span style={{ color: "#ff9800" }} className="cursor-default">
							Signal found
						</span>
					</TooltipTrigger>
					<TooltipContent sideOffset={10} className="text-xs">
						<p>Mimir found a candidate fraud signal. Confirm or dismiss it.</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	if (isExported) {
		const ProviderIcon = exportProvider ? PROVIDER_ICONS[exportProvider] : null;

		return (
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="cursor-default">Approved</span>
					</TooltipTrigger>
					<TooltipContent sideOffset={10} className="text-xs">
						<div className="flex flex-col gap-1">
							<div className="flex items-center gap-1.5">
								<span>Approved in</span>
								{ProviderIcon && <ProviderIcon className="size-4" />}
								<span>{getProviderName(exportProvider)}</span>
							</div>
							{exportedAt && (
								<span className="text-[11px] text-muted-foreground">
									{formatExportDate(exportedAt)}
								</span>
							)}
						</div>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	return <span className="cursor-default text-[#878787]">Not flagged</span>;
}
