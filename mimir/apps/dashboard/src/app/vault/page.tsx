import {
	type RedirectSearchParams,
	redirectWithSearch,
} from "../redirect-with-search";

export default async function VaultAlias({
	searchParams,
}: {
	searchParams: RedirectSearchParams;
}) {
	await redirectWithSearch("/en/vault", searchParams);
}
