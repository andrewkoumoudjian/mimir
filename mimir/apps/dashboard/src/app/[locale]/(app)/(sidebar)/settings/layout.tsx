import { SecondaryMenu } from "@/components/secondary-menu";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[800px]">
      <SecondaryMenu
        items={[
          { path: "/settings", label: "General" },
          { path: "/settings/billing", label: "Cost Controls" },
          { path: "/settings/accounts", label: "Data Sources" },
          { path: "/settings/members", label: "Reviewer Roles" },
          { path: "/settings/notifications", label: "Alert Routing" },
          { path: "/settings/developer", label: "API Contract" },
        ]}
      />

      <main className="mt-8">{children}</main>
    </div>
  );
}
