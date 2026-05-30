import { formatCurrency, formatPercent } from "@/lib/transactions/format";
import type { MerchantSummary } from "@/types/transactions";

type TopMerchantsTableProps = {
  merchants: MerchantSummary[];
};

export function TopMerchantsTable({ merchants }: TopMerchantsTableProps) {
  const maxSpend = merchants[0]?.totalSpend ?? 0;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="section-kicker">Spend mix</p>
          <h2>Top merchants</h2>
        </div>
      </div>

      <div className="merchant-chart" role="img" aria-label="Top merchants by spend">
        {merchants.map((merchant) => {
          const height = maxSpend > 0 ? Math.max((merchant.totalSpend / maxSpend) * 100, 12) : 12;

          return (
            <article key={merchant.merchant} className="merchant-chart-column">
              <div className="merchant-chart-meta">
                <strong>{formatCurrency(merchant.totalSpend)}</strong>
                <span>{formatPercent(merchant.shareOfSpend)}</span>
              </div>
              <div className="merchant-chart-bar-track" aria-hidden="true">
                <div
                  className="merchant-chart-bar"
                  style={{ height: `${height}%` }}
                />
              </div>
              <div className="merchant-chart-labels">
                <strong title={merchant.merchant}>{merchant.merchant}</strong>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
