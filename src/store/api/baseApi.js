import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

/**
 * Single RTK Query API slice — sari data fetching isi se hogi.
 * Browser Supabase ko directly call NAHI karta; sab kuch hamare
 * /api routes se jata hai (guards + services wahan chalte hain).
 */
export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api",
    credentials: "same-origin",
  }),
  tagTypes: [
    "Auth",
    "Setup",
    "Dashboard",
    "Employees",
    "Users",
    "Attendance",
    "Leave",
    "Payroll",
    "Org",
    "Announcements",
    "Notifications",
    "Audit",
  ],
  endpoints: () => ({}),
});
