import {
	type RedirectSearchParams,
	redirectWithSearch,
} from "./redirect-with-search";

export default async function HomeAlias({
	searchParams,
}: {
	searchParams: RedirectSearchParams;
}) {
	await redirectWithSearch("/en", searchParams);
}
