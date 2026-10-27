import { baseApi } from "./baseApi";

/**
 * Leave module (Phase 5) — apply, balances, inbox, decisions, cancel,
 * team calendar. Sab /api/leave/* se.
 */

export const leaveApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ---- Self-service snapshot (balances + my requests + meta) ----
    getMyLeave: build.query({
      query: () => "leave/me",
      transformResponse: (res) => res?.data ?? null,
      providesTags: ["Leave"],
    }),

    // ---- Apply (self; staff on-behalf via employeeId) ----
    applyLeave: build.mutation({
      query: (body) => ({ url: "leave", method: "POST", body }),
      invalidatesTags: ["Leave", "Attendance", "Dashboard"],
    }),

    // ---- Staff: requests browser / approval inbox ----
    getLeaveRequests: build.query({
      query: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.status) params.set("status", filters.status);
        if (filters.type) params.set("type", filters.type);
        if (filters.q) params.set("q", filters.q);
        if (filters.from) params.set("from", filters.from);
        if (filters.to) params.set("to", filters.to);
        if (filters.page) params.set("page", String(filters.page));
        const qs = params.toString();
        return `leave/requests${qs ? `?${qs}` : ""}`;
      },
      transformResponse: (res) => res?.data ?? { rows: [], total: 0, page: 1, pageSize: 20 },
      providesTags: ["Leave"],
      refetchOnFocus: true,
    }),

    // ---- Staff: approve / reject ----
    decideLeave: build.mutation({
      query: ({ id, ...body }) => ({
        url: `leave/requests/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Leave", "Attendance", "Dashboard"],
    }),

    // ---- Cancel (own pending via RPC; staff any pending) ----
    cancelLeave: build.mutation({
      query: (id) => ({ url: `leave/requests/${id}/cancel`, method: "POST", body: {} }),
      invalidatesTags: ["Leave", "Attendance", "Dashboard"],
    }),

    // ---- Staff: team calendar ----
    getLeaveCalendar: build.query({
      query: (month) => `leave/calendar?month=${encodeURIComponent(month)}`,
      transformResponse: (res) => res?.data ?? null,
      providesTags: ["Leave"],
    }),
  }),
});

export const {
  useGetMyLeaveQuery,
  useApplyLeaveMutation,
  useGetLeaveRequestsQuery,
  useDecideLeaveMutation,
  useCancelLeaveMutation,
  useGetLeaveCalendarQuery,
} = leaveApi;
