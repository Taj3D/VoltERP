import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware to handle cross-origin requests from the preview panel.
 *
 * The preview panel loads from *.space-z.ai domains, which Next.js dev server
 * blocks by default for /_next/* resources. This middleware adds the necessary
 * CORS and framing headers so the preview panel can load the app.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const origin = request.headers.get("origin") || "";

  // Allow preview panel origins (space-z.ai) and localhost
  const isAllowedOrigin =
    origin.includes(".space-z.ai") ||
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    origin.includes("embd-j.com");

  if (isAllowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, x-user-email, Authorization");
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("X-Frame-Options", "ALLOWALL");
  }

  // Handle CORS preflight
  if (request.method === "OPTIONS" && isAllowedOrigin) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-user-email, Authorization",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.svg|robots.txt|guides).*)",
  ],
};
