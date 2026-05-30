import { formatRecommendationLabel } from "@/lib/pre-approval/mock-enrichment";
import type { RecommendationState } from "@/types/pre-approval";

type RecommendationBadgeProps = {
  recommendation: RecommendationState;
};

export function RecommendationBadge({ recommendation }: RecommendationBadgeProps) {
  return (
    <span className={`recommendation-badge recommendation-${recommendation}`}>
      {formatRecommendationLabel(recommendation)}
    </span>
  );
}
