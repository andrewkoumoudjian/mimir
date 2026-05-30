import { formatCompactDate, formatCurrency } from "@/lib/transactions/format";
import type { NormalizedTransaction } from "@/types/transactions";

type TransactionTableProps = {
  transactions: NormalizedTransaction[];
};

export function TransactionTable({ transactions }: TransactionTableProps) {
  return (
    <section className="transactions-panel">
      <div className="transactions-header">
        <div>
          <p className="section-kicker">Ledger</p>
          <h2>Recent transactions</h2>
        </div>
        <span className="muted-line">Latest {transactions.length} records shown</span>
      </div>

      <div className="table-scroll">
        <table className="transactions-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Merchant</th>
              <th>Description</th>
              <th>Category</th>
              <th>Country</th>
              <th>Type</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{formatCompactDate(transaction.date)}</td>
                <td>{transaction.merchant}</td>
                <td>{transaction.description}</td>
                <td>{transaction.category ?? "Uncategorized"}</td>
                <td>{transaction.country ?? "Unknown"}</td>
                <td>
                  <span className="type-badge">{transaction.type}</span>
                </td>
                <td className={transaction.amount < 0 ? "amount-negative" : "amount-positive"}>
                  {formatCurrency(transaction.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
