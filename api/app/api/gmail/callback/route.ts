import { NextRequest } from "next/server";
import { appendQuery, encryptToken, exchangeCode, getProfileEmail, isAllowedReturnUrl, verifyState } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const state = verifyState(params.get("state") ?? "");
  if (!state || !isAllowedReturnUrl(state.return)) {
    return errorPage("잘못된 요청이에요. 앱에서 Gmail 연결을 다시 시도해 주세요.");
  }
  if (params.get("error") === "access_denied") {
    return errorPage("Gmail 접근을 허용하지 않아 연결이 취소되었어요. 앱으로 돌아가 주세요.");
  }
  const code = params.get("code");
  if (!code) return errorPage("Google에서 인증 코드를 받지 못했어요. 다시 시도해 주세요.");

  try {
    const { accessToken, refreshToken } = await exchangeCode(code);
    const email = await getProfileEmail(accessToken);
    const token = encryptToken({ refresh_token: refreshToken, email });
    return new Response(null, { status: 302, headers: { location: appendQuery(state.return, { token, email }) } });
  } catch (error) {
    console.error(error);
    return errorPage("Gmail 연결 중 문제가 생겼어요. 잠시 후 앱에서 다시 시도해 주세요.");
  }
}

function errorPage(message: string): Response {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gmail 연결 실패</title></head><body style="font-family:sans-serif;font-size:20px;padding:32px;line-height:1.5"><h1 style="font-size:24px">Gmail 연결 실패</h1><p>${message}</p></body></html>`;
  return new Response(html, { status: 400, headers: { "content-type": "text/html; charset=utf-8" } });
}
