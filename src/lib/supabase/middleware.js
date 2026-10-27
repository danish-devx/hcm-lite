import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

/**
 * Middleware ke liye session update helper.
 * Har request par Supabase auth cookies refresh karta hai taake
 * SSR pages ko fresh session mile.
 *
 * Cookie attributes: preview/chat panel cross-site iframe me embed hota hai
 * jahan SameSite=Lax cookies block hoti hain → non-localhost (HTTPS) requests
 * par SameSite=None; Secure set karte hain. Local dev (http) me lax hi theek hai.
 */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export async function updateSession(request) {
  let supabaseResponse = NextResponse.next({ request });

  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "";
  const secureContext =
    forwardedProto.includes("https") ||
    !LOCAL_HOST.test(request.headers.get("host") ?? "");

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          const finalOptions = (options) =>
            secureContext
              ? { ...options, sameSite: "none", secure: true }
              : options;
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, finalOptions(options))
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() hi token verify + refresh karta hai
  // (getSession() ko middleware me trust na karein)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user };
}
