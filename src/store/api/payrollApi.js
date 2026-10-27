import { baseApi } from "./baseApi";

/**
 * Payroll module (Phase 6) — runs, items, finalize, recalc, self payslips.
 * PDF download direct <a href> se hota hai (cookie auth, same-origin) —
 * RTK me nahi, kyunke browser ne download handle karna hai.
 */

export const payrollApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ---- Staff: runs list + totals ----
    getPayrollRuns: build.query({
      query: () => "payroll/runs",
      transformResponse: (res) => res?.data ?? { rows: [] },
      providesTags: ["Payroll"],
    }),

    // ---- Staff: create draft run ----
    createPayrollRun: build.mutation({
      query: (body) => ({ url: "payroll/runs", method: "POST", body }),
      invalidatesTags: ["Payroll", "Dashboard"],
    }),

    // ---- Staff: run detail (items + totals) ----
    getPayrollRun: build.query({
      query: (id) => `payroll/runs/${id}`,
      transformResponse: (res) => res?.data ?? null,
      providesTags: (result, error, id) => [{ type: "Payroll", id }],
    }),

    // ---- Staff: delete draft ----
    deletePayrollRun: build.mutation({
      query: (id) => ({ url: `payroll/runs/${id}`, method: "DELETE" }),
      invalidatesTags: ["Payroll", "Dashboard"],
    }),

    // ---- Admin: finalize (lock) ----
    finalizePayrollRun: build.mutation({
      query: (id) => ({
        url: `payroll/runs/${id}/finalize`,
        method: "POST",
        body: {},
      }),
      invalidatesTags: (result, error, id) => [
        "Payroll",
        { type: "Payroll", id },
        "Dashboard",
      ],
    }),

    // ---- Staff: recalc draft ----
    recalculatePayrollRun: build.mutation({
      query: (id) => ({
        url: `payroll/runs/${id}/recalculate`,
        method: "POST",
        body: {},
      }),
      invalidatesTags: (result, error, id) => [
        "Payroll",
        { type: "Payroll", id },
        "Dashboard",
      ],
    }),

    // ---- Self: my finalized payslips ----
    getMyPayslips: build.query({
      query: () => "payroll/me",
      transformResponse: (res) => res?.data ?? { linked: false, rows: [], summary: null },
      providesTags: ["Payroll"],
    }),
  }),
});

export const {
  useGetPayrollRunsQuery,
  useCreatePayrollRunMutation,
  useGetPayrollRunQuery,
  useDeletePayrollRunMutation,
  useFinalizePayrollRunMutation,
  useRecalculatePayrollRunMutation,
  useGetMyPayslipsQuery,
} = payrollApi;
