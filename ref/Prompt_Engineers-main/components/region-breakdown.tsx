import { formatCurrency, formatPercent } from "@/lib/transactions/format";
import type { CountryBreakdown } from "@/types/transactions";

type RegionBreakdownProps = {
  regions: CountryBreakdown[];
};

export function RegionBreakdown({ regions }: RegionBreakdownProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="section-kicker">Locations</p>
          <h2>Country breakdown</h2>
        </div>
      </div>

      <table className="breakdown-table">
        <thead>
          <tr>
            <th>Country</th>
            <th>Spend</th>
            <th>Share</th>
          </tr>
        </thead>
        <tbody>
          {regions.map((region) => (
            <tr key={region.country}>
              <td>{region.country}</td>
              <td>{formatCurrency(region.totalSpend)}</td>
              <td className="share-cell">{formatPercent(region.shareOfSpend)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
