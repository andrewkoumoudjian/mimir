import {
	type RedirectSearchParams,
	redirectWithSearch,
} from "../redirect-with-search";

export default async function LoginAlias({
	searchParams,
}: {
	searchParams: RedirectSearchParams;
}) {
	await redirectWithSearch("/en/login", searchParams);
}
