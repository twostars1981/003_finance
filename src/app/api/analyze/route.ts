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

  /** 수익성·리스크 논의에 필요한 계정을 더 넘기기 위해 상한 완화 */
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 80) : [];
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

  const prompt = `당신은 한국 상장사 공시 재무제표를 바탕으로, 비전문가도 이해할 수 있게 정리해 주는 금융 설명 도우미입니다.

다음 JSON은 OpenDART 단일회사 주요계정 API에서 가져온 실제 데이터입니다. 사용자 화면의 차트(막대·선·파이 등)는 이 계정들의 당기·전기 금액을 시각화한 것입니다.
${JSON.stringify(payload, null, 2)}

반드시 다음 구조와 관점을 포함해 한국어로 작성하세요. (총 10~16문단 정도, 소제목 ## 로 구분해도 좋습니다.)

1) 차트에 나오는 지표가 왜 중요한가
- JSON에 포함된 주요 계정(매출·이익·자산·부채·현금흐름 관련 항목이 있다면 해당 항목)을 짚어, 재무제표·사업 이해에 왜 쓰이는지, 차트로 당기·전기를 비교하면 무엇을 보려는 것인지 설명하세요.
- "단순 숫자 나열"이 아니라 지표별 해석 포인트를 쉬운 말로 적으세요.

2) 수익성 중심 분석
- 가능한 범위에서 매출 대비 이익(영업이익·당기순이익 등 데이터에 있는 항목)의 흐름, 비용·이익 구조가 당기·전기 비교에서 어떻게 보이는지 중심으로 설명하세요.
- 데이터만으로 계산할 수 있는 간단한 비율이나 증감(전년 대비)이 있으면 언급하되, 없는 비율은 만들지 마세요.

3) 시장성·성장 가능성에 대한 논의 (한계를 분명히)
- 위 공시 수치만으로는 산업 점유율·경쟁 구조·주가·밸류에이션을 단정할 수 없음을 밝힌 뒤, **표에 나타난 숫자만** 근거로 "규모·성장·수익 방향"을 어떻게 읽을 수 있는지 가능한 범위에서 논의하세요.
- 외부 시장 데이터나 뉴스는 추측하지 마세요.

4) 투자 리스크
- 이 데이터만 볼 때의 한계(주요계정 요약, 단일 연도·분기, 연결/개별 구분 등), 해석의 불확실성, 추가로 봐야 할 공시·항목을 bullet 형태로 정리하세요.

5) 투자 판단에 대한 참고 의견 (단정 금지)
- "투자해도 되는가"에 대해 **참고용 균형 잡힌 요약**을 제시하세요: 긍정적으로 읽을 수 있는 점과 우려되는 점을 모두 적고, 최종 매수·매도·목표주가·수익 보장은 제시하지 마세요.
- 반드시 "개인적인 투자 자문이 아니며, 투자 결정은 본인 책임이고 필요 시 증권·세무 전문가 상담을 권장한다"는 취지의 문장을 포함하세요.

공통 규칙:
- 금액은 조·억 등 읽기 쉬운 단위로 풀어 써도 됩니다.
- 데이터에 없는 사실·수치는 지어내지 마세요. 불확실하면 "해석에 따라 다를 수 있습니다"라고 명시하세요.

서두 첫 문단에 "공시·API 요약과 원문이 다를 수 있으니 DART 공시 원문을 함께 확인하라"는 안내를 넣으세요.`;

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
