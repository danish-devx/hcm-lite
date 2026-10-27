import { baseApi } from "./baseApi";

/**
 * Organization module (Phase 2) — settings, departments, designations,
 * leave types aur holidays. Sab kuch /api/organization/* routes se.
 */
export const organizationApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ---- Company settings (singleton) ----
    getSettings: build.query({
      query: () => "organization/settings",
      transformResponse: (res) => res?.data ?? res,
      providesTags: ["Org"],
    }),
    updateSettings: build.mutation({
      query: (body) => ({
        url: "organization/settings",
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Org"],
    }),

    // ---- Departments ----
    getDepartments: build.query({
      query: () => "organization/departments",
      transformResponse: (res) => res?.data ?? [],
      providesTags: ["Org"],
    }),
    addDepartment: build.mutation({
      query: (body) => ({ url: "organization/departments", method: "POST", body }),
      invalidatesTags: ["Org"],
    }),
    updateDepartment: build.mutation({
      query: ({ id, ...body }) => ({
        url: `organization/departments/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Org"],
    }),
    deleteDepartment: build.mutation({
      query: (id) => ({ url: `organization/departments/${id}`, method: "DELETE" }),
      invalidatesTags: ["Org"],
    }),

    // ---- Designations ----
    getDesignations: build.query({
      query: () => "organization/designations",
      transformResponse: (res) => res?.data ?? [],
      providesTags: ["Org"],
    }),
    addDesignation: build.mutation({
      query: (body) => ({ url: "organization/designations", method: "POST", body }),
      invalidatesTags: ["Org"],
    }),
    updateDesignation: build.mutation({
      query: ({ id, ...body }) => ({
        url: `organization/designations/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Org"],
    }),
    deleteDesignation: build.mutation({
      query: (id) => ({ url: `organization/designations/${id}`, method: "DELETE" }),
      invalidatesTags: ["Org"],
    }),

    // ---- Leave types ----
    getLeaveTypes: build.query({
      query: () => "organization/leave-types",
      transformResponse: (res) => res?.data ?? [],
      providesTags: ["Org"],
    }),
    addLeaveType: build.mutation({
      query: (body) => ({ url: "organization/leave-types", method: "POST", body }),
      invalidatesTags: ["Org"],
    }),
    updateLeaveType: build.mutation({
      query: ({ id, ...body }) => ({
        url: `organization/leave-types/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Org"],
    }),
    deleteLeaveType: build.mutation({
      query: (id) => ({ url: `organization/leave-types/${id}`, method: "DELETE" }),
      invalidatesTags: ["Org"],
    }),

    // ---- Holidays ----
    getHolidays: build.query({
      query: () => "organization/holidays",
      transformResponse: (res) => res?.data ?? [],
      providesTags: ["Org"],
    }),
    addHoliday: build.mutation({
      query: (body) => ({ url: "organization/holidays", method: "POST", body }),
      invalidatesTags: ["Org"],
    }),
    updateHoliday: build.mutation({
      query: ({ id, ...body }) => ({
        url: `organization/holidays/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Org"],
    }),
    deleteHoliday: build.mutation({
      query: (id) => ({ url: `organization/holidays/${id}`, method: "DELETE" }),
      invalidatesTags: ["Org"],
    }),
  }),
});

export const {
  useGetSettingsQuery,
  useUpdateSettingsMutation,
  useGetDepartmentsQuery,
  useAddDepartmentMutation,
  useUpdateDepartmentMutation,
  useDeleteDepartmentMutation,
  useGetDesignationsQuery,
  useAddDesignationMutation,
  useUpdateDesignationMutation,
  useDeleteDesignationMutation,
  useGetLeaveTypesQuery,
  useAddLeaveTypeMutation,
  useUpdateLeaveTypeMutation,
  useDeleteLeaveTypeMutation,
  useGetHolidaysQuery,
  useAddHolidayMutation,
  useUpdateHolidayMutation,
  useDeleteHolidayMutation,
} = organizationApi;
