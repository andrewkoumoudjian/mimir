"use client";

import type { AppRole } from "@/lib/request-store";

type RoleToggleProps = {
  role: AppRole;
  onChange: (role: AppRole) => void;
};

export function RoleToggle({ role, onChange }: RoleToggleProps) {
  return (
    <div className="role-toggle" role="tablist" aria-label="Role simulation">
      {(["employee", "manager"] as const).map((option) => (
        <button
          key={option}
          type="button"
          className={`role-toggle-option ${role === option ? "is-active" : ""}`}
          onClick={() => onChange(option)}
        >
          {option === "employee" ? "Employee" : "Manager"}
        </button>
      ))}
    </div>
  );
}
