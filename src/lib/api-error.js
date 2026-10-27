/**
 * API error response → user-facing message.
 * apiHandler { error, details[] } shape ko normalize karta hai.
 */
export function getApiError(err, fallback = "Something went wrong. Please try again.") {
  const data = err?.data;
  if (data?.details?.length) {
    return data.details.map((d) => d.message).join(" ");
  }
  return data?.error || err?.error || fallback;
}
