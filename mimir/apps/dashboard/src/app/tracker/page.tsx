import {
	type RedirectSearchParams,
	redirectWithSearch,
} from "../redirect-with-search";

export default async function TrackerAlias({
	searchParams,
}: {
	searchParams: RedirectSearchParams;
}) {
	await redirectWithSearch("/en/tracker", searchParams);
}
