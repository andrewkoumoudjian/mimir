import Link from "next/link";

type AppNavProps = {
  currentPath: "/" | "/pre-approval" | "/expense-reports";
  role: "employee" | "manager";
};

export function AppNav({ currentPath, role }: AppNavProps) {
  return (
    <nav className="app-nav" aria-label="Primary navigation">
      {role === "manager" ? (
        <Link
          href="/"
          className={`app-nav-link ${currentPath === "/" ? "is-active" : ""}`}
        >
          Dashboard
        </Link>
      ) : null}
      <Link
        href="/pre-approval"
        className={`app-nav-link ${currentPath === "/pre-approval" ? "is-active" : ""}`}
      >
        {role === "manager" ? "New Requests" : "New Expense"}
      </Link>
      {role === "manager" ? (
        <Link
          href="/expense-reports"
          className={`app-nav-link ${currentPath === "/expense-reports" ? "is-active" : ""}`}
        >
          Expense Reports
        </Link>
      ) : null}
    </nav>
  );
}
