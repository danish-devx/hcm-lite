import { baseApi } from "./baseApi";

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSetupStatus: build.query({
      query: () => "setup/status",
      providesTags: ["Setup"],
    }),
    getMe: build.query({
      query: () => "auth/me",
      providesTags: ["Auth"],
    }),
    login: build.mutation({
      query: (body) => ({ url: "auth/login", method: "POST", body }),
      invalidatesTags: ["Auth", "Dashboard"],
    }),
    logout: build.mutation({
      query: () => ({ url: "auth/logout", method: "POST" }),
      invalidatesTags: [
        "Auth",
        "Dashboard",
        "Employees",
        "Attendance",
        "Leave",
        "Payroll",
        "Org",
        "Announcements",
        "Notifications",
        "Audit",
      ],
    }),
    changePassword: build.mutation({
      query: (body) => ({
        url: "auth/change-password",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Auth"],
    }),
    runSetup: build.mutation({
      query: (body) => ({ url: "setup", method: "POST", body }),
      invalidatesTags: ["Setup"],
    }),
    updateMyContact: build.mutation({
      query: (body) => ({ url: "profile/contact", method: "POST", body }),
      invalidatesTags: ["Auth"],
    }),
  }),
});

export const {
  useGetSetupStatusQuery,
  useGetMeQuery,
  useLoginMutation,
  useLogoutMutation,
  useChangePasswordMutation,
  useRunSetupMutation,
  useUpdateMyContactMutation,
} = authApi;
