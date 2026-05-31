import { redirect } from "next/navigation";

export type RedirectSearchParams = Promise<
	Record<string, string | string[] | undefined>
>;

export async function redirectWithSearch(
	pathname: string,
	searchParams?: RedirectSearchParams,
) {
	const params = new URLSearchParams();
	const resolvedSearchParams = searchParams ? await searchParams : {};

	for (const [key, value] of Object.entries(resolvedSearchParams)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				params.append(key, item);
			}
		} else if (value !== undefined) {
			params.set(key, value);
		}
	}

	const query = params.toString();

	redirect(query ? `${pathname}?${query}` : pathname);
}
