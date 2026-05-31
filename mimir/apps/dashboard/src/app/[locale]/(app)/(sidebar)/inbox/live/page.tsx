import type { Metadata } from "next";
import { SyntheticLiveTimeline } from "./synthetic-live-timeline";

export const metadata: Metadata = {
	title: "Synthetic Live Feed | Mimir",
};

export default async function SyntheticLiveFeedPage() {
	return <SyntheticLiveTimeline />;
}
