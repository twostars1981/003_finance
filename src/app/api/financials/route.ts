import { NextRequest, NextResponse } from "next/server";

const DART_FNLT = "https://opendart.fss.or.kr/api/fnlttSinglAcnt.json";

export async function GET(request: NextRequest) {
  const key = process.env.OPENDART_CRTFC_KEY;
  if (!key?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "OpenDART API 키가 설정되지 않았습니다. 서버 환경 변수 OPENDART_CRTFC_KEY를 설정하세요.",
      },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const corp_code = searchParams.get("corp_code")?.trim();
  const bsns_year = searchParams.get("bsns_year")?.trim();
  const reprt_code = searchParams.get("reprt_code")?.trim();

  if (!corp_code || !bsns_year || !reprt_code) {
    return NextResponse.json(
      {
        ok: false,
        error: "corp_code, bsns_year, reprt_code 쿼리가 모두 필요합니다.",
      },
      { status: 400 },
    );
  }

  const url = new URL(DART_FNLT);
  url.searchParams.set("crtfc_key", key);
  url.searchParams.set("corp_code", corp_code);
  url.searchParams.set("bsns_year", bsns_year);
  url.searchParams.set("reprt_code", reprt_code);

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    const json: unknown = await res.json();
    return NextResponse.json(json);
  } catch (e) {
    const message = e instanceof Error ? e.message : "OpenDART 요청 실패";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
