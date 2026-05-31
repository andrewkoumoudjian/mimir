import {
	type RedirectSearchParams,
	redirectWithSearch,
} from "../redirect-with-search";

export default async function AppsAlias({
	searchParams,
}: {
	searchParams: RedirectSearchParams;
}) {
	await redirectWithSearch("/en/apps", searchParams);
}
