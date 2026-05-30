type MetricCardProps = {
  label: string;
  value: string;
  helperText: string;
  compact?: boolean;
};

export function MetricCard({ label, value, helperText, compact = false }: MetricCardProps) {
  return (
    <article className={`metric-card ${compact ? "metric-card-compact" : ""}`}>
      <p className="metric-label">{label}</p>
      <h2 className="metric-value">{value}</h2>
      <p className="metric-helper">{helperText}</p>
    </article>
  );
}
