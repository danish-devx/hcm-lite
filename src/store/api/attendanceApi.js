import { baseApi } from "./baseApi";

/**
 * Attendance module (Phase 4) — check-in/out, self view, daily board,
 * records browser + corrections. Sab /api/attendance/* se.
 */

export const attendanceApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ---- Employee self-service ----
    getMyAttendance: build.query({
      query: () => "attendance/me",
      transformResponse: (res) => res?.data ?? null,
      providesTags: ["Attendance"],
      // live card ke liye halka polling + focus refetch
      pollingInterval: 60_000,
      refetchOnFocus: true,
    }),
    checkIn: build.mutation({
      query: (body = {}) => ({ url: "attendance/check-in", method: "POST", body }),
      invalidatesTags: ["Attendance", "Dashboard"],
    }),
    checkOut: build.mutation({
      query: () => ({ url: "attendance/check-out", method: "POST", body: {} }),
      invalidatesTags: ["Attendance", "Dashboard"],
    }),

    // ---- Staff: daily board + records ----
    getDailyBoard: build.query({
      query: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.date) params.set("date", filters.date);
        if (filters.department) params.set("department", filters.department);
        if (filters.q) params.set("q", filters.q);
        const qs = params.toString();
        return `attendance${qs ? `?${qs}` : ""}`;
      },
      transformResponse: (res) => res?.data ?? null,
      providesTags: ["Attendance"],
      pollingInterval: 45_000, // live board
      refetchOnFocus: true,
    }),
    getAttendanceRecords: build.query({
      query: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.from) params.set("from", filters.from);
        if (filters.to) params.set("to", filters.to);
        if (filters.status) params.set("status", filters.status);
        if (filters.q) params.set("q", filters.q);
        if (filters.page) params.set("page", String(filters.page));
        const qs = params.toString();
        return `attendance/records${qs ? `?${qs}` : ""}`;
      },
      transformResponse: (res) => res?.data ?? { rows: [], total: 0, page: 1, pageSize: 20 },
      providesTags: ["Attendance"],
    }),

    // ---- Corrections ----
    getCorrections: build.query({
      query: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.status) params.set("status", filters.status);
        const qs = params.toString();
        return `attendance/corrections${qs ? `?${qs}` : ""}`;
      },
      transformResponse: (res) => res?.data ?? [],
      providesTags: ["Attendance"],
    }),
    requestCorrection: build.mutation({
      query: (body) => ({ url: "attendance/corrections", method: "POST", body }),
      invalidatesTags: ["Attendance"],
    }),
    decideCorrection: build.mutation({
      query: ({ id, ...body }) => ({
        url: `attendance/corrections/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Attendance"],
    }),
  }),
});

export const {
  useGetMyAttendanceQuery,
  useCheckInMutation,
  useCheckOutMutation,
  useGetDailyBoardQuery,
  useGetAttendanceRecordsQuery,
  useGetCorrectionsQuery,
  useRequestCorrectionMutation,
  useDecideCorrectionMutation,
} = attendanceApi;
