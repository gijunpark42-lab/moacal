import { NextRequest, NextResponse } from "next/server";
import { appendQuery, buildAuthUrl, GMAIL_MOCK, isAllowedReturnUrl } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const returnUrl = req.nextUrl.searchParams.get("return") ?? "";
  if (!isAllowedReturnUrl(returnUrl)) {
    return NextResponse.json({ error: "return must be an exp://, inboxcalendar://, or local http:// URL" }, { status: 400 });
  }

  if (GMAIL_MOCK) {
    console.log("[gmail] mock mode: skipping Google consent (set GOOGLE_CLIENT_ID to go live)");
    return redirect(appendQuery(returnUrl, { token: "mock", email: "mock@example.com" }));
  }

  try {
    return redirect(buildAuthUrl(returnUrl));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
}

// Plain Response so custom schemes (exp://, inboxcalendar://) are passed through untouched.
function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}
