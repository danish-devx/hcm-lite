import { NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_ROUTES = ["/login", "/first-run"];

export async function proxy(request) {
  const { supabaseResponse, user } = await updateSession(request);

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  // Not signed in → sirf public routes (login ke baad wapas isi page par jane ke liye ?next=)
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const next = pathname + (request.nextUrl.search || "");
    if (next && next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  // Signed in → login/first-run par mat ruko
  if (user && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Trailing-slash loop breaker: external gateway /dashboard ko /dashboard/
  // par 301 karta hai aur Next wapas /dashboard par 308 → infinite loop.
  // Isliye slashed path ko INTERNALLY unslashed par rewrite karte hain —
  // browser slashed URL par hi rehta hai, koi redirect emit nahi hota.
  // (Auth checks upar ho chuke — rewrite sirf ab, authorized requests par.)
  if (pathname.length > 1 && pathname.endsWith("/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/\/+$/, "");
    const rewritten = NextResponse.rewrite(url);
    // Session-refresh cookies (agar koi) rewritten response par carry karo
    for (const cookie of supabaseResponse.cookies.getAll()) {
      rewritten.cookies.set(cookie);
    }
    return rewritten;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Sab routes except:
     * - _next/static, _next/image (build assets)
     * - favicon, images
     * - api routes (wo khud guards.js se authorize hote hain)
     */
    "/((?!_next/static|_next/image|api/|favicon.ico|manifest\\.webmanifest|models/|mediapipe/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
