import { baseApi } from "./baseApi";

/**
 * Comms & Audit (Phase 9, M9) — announcements, in-app notifications,
 * admin audit-log browser. Sab /api/announcements|notifications|audit-log se.
 */

export const commsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ---- Announcements (F23) ----
    getAnnouncements: build.query({
      query: (limit) => `announcements${limit ? `?limit=${limit}` : ""}`,
      transformResponse: (res) => res?.data ?? [],
      providesTags: ["Announcements"],
    }),

    createAnnouncement: build.mutation({
      query: (body) => ({ url: "announcements", method: "POST", body }),
      invalidatesTags: ["Announcements", "Notifications"],
    }),

    deleteAnnouncement: build.mutation({
      query: (id) => ({ url: `announcements/${id}`, method: "DELETE" }),
      invalidatesTags: ["Announcements"],
    }),

    // ---- Notifications (F24) ----
    getNotifications: build.query({
      query: () => "notifications",
      transformResponse: (res) =>
        res?.data ?? { items: [], unread: 0 },
      providesTags: ["Notifications"],
      refetchOnFocus: true,
    }),

    markNotificationsRead: build.mutation({
      query: (body) => ({ url: "notifications", method: "POST", body }),
      invalidatesTags: ["Notifications"],
    }),

    // ---- Audit log (F25, admin) ----
    getAuditLog: build.query({
      query: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.q) params.set("q", filters.q);
        if (filters.group) params.set("group", filters.group);
        if (filters.actorId) params.set("actorId", filters.actorId);
        if (filters.from) params.set("from", filters.from);
        if (filters.to) params.set("to", filters.to);
        if (filters.page) params.set("page", String(filters.page));
        const qs = params.toString();
        return `audit-log${qs ? `?${qs}` : ""}`;
      },
      transformResponse: (res) =>
        res?.data ?? {
          items: [],
          total: 0,
          page: 1,
          pageSize: 25,
          groups: [],
          actions: [],
        },
      providesTags: (result, error, filters) => [
        { type: "Audit", id: JSON.stringify(filters ?? {}) },
      ],
    }),
  }),
});

export const {
  useGetAnnouncementsQuery,
  useCreateAnnouncementMutation,
  useDeleteAnnouncementMutation,
  useGetNotificationsQuery,
  useMarkNotificationsReadMutation,
  useGetAuditLogQuery,
} = commsApi;
