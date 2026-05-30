import type { DashboardInsight } from "@/types/transactions";

type InsightListProps = {
  insights: DashboardInsight[];
};

export function InsightList({ insights }: InsightListProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="section-kicker">Priority queue</p>
          <h2>Findings</h2>
        </div>
        <span className="muted-line">{insights.length} findings</span>
      </div>

      <ol className="insight-list">
        {insights.map((insight) => (
          <li className="insight-item" key={insight.id}>
            <span className="insight-tag">{insight.label}</span>
            <strong>{insight.title}</strong>
            <div className="muted-line">{insight.detail}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
