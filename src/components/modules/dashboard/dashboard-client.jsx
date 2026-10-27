"use client";

import * as React from "react";

import { AdminDashboard } from "./admin-dashboard";
import { EmployeeDashboard } from "./employee-dashboard";
import { FiltersBar } from "./filters-bar";
import { HrDashboard } from "./hr-dashboard";

/**
 * Role-aware dashboard body (M7). Staff ko filters (date range + department)
 * milte hain; employee personal dashboard filter-free hota hai.
 * Server page company-tz "today" pass karta hai taake presets wahi date use karein.
 */
export function DashboardClient({ role, today }) {
  const [filters, setFilters] = React.useState({
    from: `${today.slice(0, 4)}-01-01`,
    to: today,
    department: null,
  });

  if (role === "employee") {
    return <EmployeeDashboard />;
  }

  return (
    <div className="space-y-4">
      <FiltersBar today={today} value={filters} onChange={setFilters} />
      {role === "admin" ? (
        <AdminDashboard filters={filters} ready />
      ) : (
        <HrDashboard filters={filters} ready />
      )}
    </div>
  );
}
