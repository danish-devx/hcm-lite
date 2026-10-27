import { baseApi } from "./baseApi";

/**
 * Employees module (Phase 3) — directory, Employee 360, auto-login create,
 * CSV import/export + admin Users & Logins. Sab /api/employees/* aur /api/users/* se.
 */
export const employeesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ---- Directory ----
    getEmployees: build.query({
      query: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.q) params.set("q", filters.q);
        if (filters.department) params.set("department", filters.department);
        if (filters.status) params.set("status", filters.status);
        const qs = params.toString();
        return `employees${qs ? `?${qs}` : ""}`;
      },
      transformResponse: (res) => res?.data ?? [],
      providesTags: ["Employees"],
    }),
    addEmployee: build.mutation({
      query: (body) => ({ url: "employees", method: "POST", body }),
      invalidatesTags: ["Employees", "Dashboard"],
    }),

    // ---- Employee 360 ----
    getEmployee: build.query({
      query: (id) => `employees/${id}`,
      transformResponse: (res) => res?.data ?? null,
      providesTags: (_res, _err, id) => [{ type: "Employees", id }],
    }),
    updateEmployee: build.mutation({
      query: ({ id, ...body }) => ({ url: `employees/${id}`, method: "PATCH", body }),
      invalidatesTags: (_res, _err, { id }) => ["Employees", { type: "Employees", id }],
    }),
    resetEmployeePassword: build.mutation({
      query: (id) => ({ url: `employees/${id}/reset-password`, method: "POST" }),
      invalidatesTags: (_res, _err, id) => ["Users", { type: "Employees", id }],
    }),

    // ---- CSV import / export ----
    importEmployees: build.mutation({
      query: (body) => ({ url: "employees/import", method: "POST", body }),
      invalidatesTags: ["Employees"],
    }),

    // ---- Users & Logins (admin) ----
    getUsers: build.query({
      query: () => "users",
      transformResponse: (res) => res?.data ?? [],
      providesTags: ["Users"],
    }),
    addUser: build.mutation({
      query: (body) => ({ url: "users", method: "POST", body }),
      invalidatesTags: ["Users"],
    }),
    updateUser: build.mutation({
      query: ({ id, ...body }) => ({ url: `users/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Users"],
    }),
    resetUserPassword: build.mutation({
      query: (id) => ({ url: `users/${id}/reset-password`, method: "POST" }),
      invalidatesTags: ["Users"],
    }),
  }),
});

export const {
  useGetEmployeesQuery,
  useAddEmployeeMutation,
  useGetEmployeeQuery,
  useUpdateEmployeeMutation,
  useResetEmployeePasswordMutation,
  useImportEmployeesMutation,
  useGetUsersQuery,
  useAddUserMutation,
  useUpdateUserMutation,
  useResetUserPasswordMutation,
} = employeesApi;
