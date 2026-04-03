import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

type AnalyzeBody = {
  companyName?: string;
  corpCode?: string;
  bsnsYear?: string;
  reprtLabel?: string;
  fsLabel?: string;
  sjLabel?: string;
  rows?: Array<{
    account_nm: string;
    thstrm_amount: string;
    frmtrm_amount: string;
  }>;
};

const DEFAULT_MODEL = "gemini-2.5-flash";

/** 무료 할당량은 모델마다 따로 잡히는 경우가 많아 순차 시도 */
const MODEL_FALLBACK_CHAIN = [
  DEFAULT_MODEL,
  "gemini-2.0-flash",
  "gemini-1.5-flash",
] as const;

function isGeminiQuotaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("429") ||
    msg.includes("Quota exceeded") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    /too many requests/i.test(msg)
  );
}

function parseRetryAfterSec(e: unknown): number | undefined {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/retry in ([\d.]+)s/i);
  if (m) {
    const n = Math.ceil(parseFloat(m[1]));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function uniqueModelOrder(envModel: string | undefined): string[] {
  const fromEnv = envModel?.trim();
  const chain: string[] = [];
  if (fromEnv) chain.push(fromEnv);
  for (const m of MODEL_FALLBACK_CHAIN) {
    if (!chain.includes(m)) chain.push(m);
  }
  return chain;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "분석 기능을 사용하려면 서버에 GEMINI_API_KEY 환경 변수를 설정하세요.",
      },
      { status: 503 },
    );
  }

  const envModel = process.env.GEMINI_MODEL?.trim();
  const modelCandidates = uniqueModelOrder(
    envModel && envModel.length > 0 ? envModel : undefined,
  );

  let body: AnalyzeBody;
  try {
    body = (await request.json()) as AnalyzeBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 40) : [];
  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "분석할 재무 항목(rows)이 없습니다." },
      { status: 400 },
    );
  }

  const payload = {
    회사명: body.companyName ?? "",
    고유번호: body.corpCode ?? "",
    사업연도: body.bsnsYear ?? "",
    보고서: body.reprtLabel ?? "",
    재무구분: body.fsLabel ?? "",
    표구분: body.sjLabel ?? "",
    계정별금액: rows,
  };

  const prompt = `당신은 한국 상장사 공시 재무제표를 비전문가에게 설명하는 도우미입니다.

다음 JSON은 OpenDART 단일회사 주요계정 API에서 가져온 실제 데이터 요약입니다.
${JSON.stringify(payload, null, 2)}

요구사항:
- 한국어로 짧고 명확하게 5~10문단 정도로 작성합니다.
- 각 문단은 일반인이 이해할 수 있는 말로, 계정명(예: 자산총계, 부채총계, 매출액)이 무엇을 의미하는지와 당기·전기 숫자 비교에서 보이는 큰 흐름만 설명합니다.
- 투자 매수·매도 권유, 목표주가, 확실한 미래 실적 예측은 하지 마세요. 불확실하거나 해석이 갈리는 부분은 "해석에 따라 다를 수 있습니다"처럼 명시하세요.
- 금액은 원 단위로 읽기 쉽게 조·억·조 단위로 풀어서 설명해도 됩니다.
- 데이터에 없는 사실은 지어내지 마세요.

서두에 "공시 원문과 다를 수 있으니 DART 원문을 함께 확인하라"는 한 문장을 넣으세요.`;

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError: unknown;
  let lastQuotaRetrySec: number | undefined;

  for (const modelName of modelCandidates) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (!text?.trim()) {
        return NextResponse.json(
          { ok: false, error: "모델이 빈 응답을 반환했습니다." },
          { status: 502 },
        );
      }
      return NextResponse.json({
        ok: true,
        text: text.trim(),
        modelUsed: modelName,
      });
    } catch (e) {
      lastError = e;
      if (isGeminiQuotaError(e)) {
        lastQuotaRetrySec = parseRetryAfterSec(e);
        continue;
      }
      break;
    }
  }

  const raw =
    lastError instanceof Error
      ? lastError.message
      : "Gemini 요청 중 오류가 발생했습니다.";
  const quota = isGeminiQuotaError(lastError);

  if (quota) {
    const wait =
      lastQuotaRetrySec != null
        ? ` Google 안내에 따르면 약 ${lastQuotaRetrySec}초 후에 다시 시도할 수 있습니다.`
        : "";
    return NextResponse.json(
      {
        ok: false,
        code: "GEMINI_QUOTA",
        error: `Gemini API 호출 한도(무료 할당량)에 걸렸습니다.${wait} 시도한 모델: ${modelCandidates.join(", ")}.

해결 방법:
• 잠시 후 다시 눌러 보기
• [Google AI Studio](https://aistudio.google.com/)에서 결제·플랜·할당량 확인
• 환경 변수 GEMINI_MODEL을 gemini-2.5-flash / gemini-2.0-flash / gemini-1.5-flash 중 하나로 바꿔 보기
• [요금·한도 안내](https://ai.google.dev/gemini-api/docs/rate-limits) 참고`,
      },
      { status: 429 },
    );
  }

  return NextResponse.json({ ok: false, error: raw }, { status: 502 });
}
