import {
	type RedirectSearchParams,
	redirectWithSearch,
} from "../redirect-with-search";

export default async function SettingsAlias({
	searchParams,
}: {
	searchParams: RedirectSearchParams;
}) {
	await redirectWithSearch("/en/settings", searchParams);
}
