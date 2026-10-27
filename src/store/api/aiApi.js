import { baseApi } from "./baseApi";

/**
 * AI Assistant (Phase 8 — M8) — mutations (cache nahi banti, har call fresh).
 *  - sendAiChat: POST ai/chat (all roles) — { reply, toolTrace, provider }
 *  - summarizeDashboard: POST ai/summarize (admin/hr) — KPI bullets
 *  - smartLeave: POST ai/smart-leave (hr/employee) — pre-filled draft
 * Rate-limit 429 friendly error ke saath aata hai (getApiError se dikhta hai).
 */
export const aiApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    sendAiChat: build.mutation({
      query: (messages) => ({ url: "ai/chat", method: "POST", body: { messages } }),
      transformResponse: (res) => res?.data ?? null,
    }),

    summarizeDashboard: build.mutation({
      query: ({ dashboard, payload, filters }) => ({
        url: "ai/summarize",
        method: "POST",
        body: { dashboard, payload, filters },
      }),
      transformResponse: (res) => res?.data ?? null,
    }),

    smartLeave: build.mutation({
      query: (text) => ({ url: "ai/smart-leave", method: "POST", body: { text } }),
      transformResponse: (res) => res?.data ?? null,
    }),
  }),
});

export const {
  useSendAiChatMutation,
  useSummarizeDashboardMutation,
  useSmartLeaveMutation,
} = aiApi;
