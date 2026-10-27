import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

/**
 * Preview/chat panel app ko cross-site iframe me embed karta hai.
 * Wahan SameSite=Lax cookies browser drop kar deta hai → login persist nahi hota.
 * Non-localhost (HTTPS deployment/preview) par SameSite=None; Secure use karein
 * taake embedded context me bhi session cookie tik jaye. Local dev me lax hi rehta hai.
 */
function isSecureContext(host, forwardedProto) {
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host || "");
  return forwardedProto.includes("https") || !isLocal;
}

/**
 * Supabase client jo current user ke session (cookies) ke saath chalta hai.
 * RLS isi user ki identity par apply hoti hai — yahi hamara defense layer 2 hai.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const h = await headers();
  const secureContext = isSecureContext(
    h.get("host"),
    h.get("x-forwarded-proto") ?? ""
  );

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(
                name,
                value,
                secureContext
                  ? { ...options, sameSite: "none", secure: true }
                  : options
              )
            );
          } catch {
            // Server Components se call par set fail ho sakta hai —
            // middleware session refresh handle karta hai.
          }
        },
      },
    }
  );
}
