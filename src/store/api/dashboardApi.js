import { baseApi } from "./baseApi";

/**
 * Dashboards & Analytics (Phase 7 — M7). Sab aggregation server-side hoti hai
 * (brief rule) — ye slice sirf typed fetches hai.
 *  - getAdminDashboard: company KPIs + payroll/gender/tenure + audit feed
 *  - getHrDashboard: today KPIs + attendance trend + absenteeism + leave use
 *  - getMyDashboard: employee personal (week hours, late count, balances, payslip)
 */

function dashboardQuery({ path, filters = {} }) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.department && filters.department !== "all") {
    params.set("department", filters.department);
  }
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ""}`;
}

export const dashboardApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAdminDashboard: build.query({
      query: (filters = {}) => dashboardQuery({ path: "dashboard/admin", filters }),
      transformResponse: (res) => res?.data ?? null,
      providesTags: ["Dashboard"],
    }),

    getHrDashboard: build.query({
      query: (filters = {}) => dashboardQuery({ path: "dashboard/hr", filters }),
      transformResponse: (res) => res?.data ?? null,
      providesTags: ["Dashboard"],
      refetchOnFocus: true, // today-KPIs fresh rakhta hai
    }),

    getMyDashboard: build.query({
      query: () => "dashboard/me",
      transformResponse: (res) => res?.data ?? null,
      providesTags: ["Dashboard"],
      refetchOnFocus: true, // check-in/out ke baad live update
    }),
  }),
});

export const {
  useGetAdminDashboardQuery,
  useGetHrDashboardQuery,
  useGetMyDashboardQuery,
} = dashboardApi;
