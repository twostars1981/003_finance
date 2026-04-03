import type { FnlttSinglRow, OpenDartFnlttResponse } from "./types";

/** OpenDART 고유번호 8자리(앞자리 0 유지). XML/JSON에서 숫자로 잘못 파싱된 값도 보정. */
export function normalizeCorpCode(raw: string): string {
  const digits = String(raw ?? "")
    .trim()
    .replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 8 ? digits.slice(-8) : digits.padStart(8, "0");
}

const DART_STATUS_KO: Record<string, string> = {
  "000": "정상적으로 조회되었습니다.",
  "010": "등록되지 않은 API 인증키입니다. 환경 변수를 확인하세요.",
  "011": "일시적으로 사용할 수 없는 키입니다.",
  "012": "허용되지 않은 IP에서 요청했습니다. OpenDART 키의 IP 설정을 확인하세요.",
  "013": "조회된 데이터가 없습니다. 사업연도·보고서·고유번호를 확인하세요.",
  "014": "파일이 존재하지 않습니다.",
  "020": "요청 제한을 초과했습니다. 잠시 후 다시 시도하세요.",
  "021": "조회 가능한 회사 개수가 초과했습니다.",
  "100": "요청 값이 올바르지 않습니다.",
  "101": "부적절한 접근입니다.",
  "800": "시스템 점검으로 서비스가 중지 중입니다.",
  "900": "정의되지 않은 오류가 발생했습니다.",
  "901": "키 사용 기간이 만료되었습니다.",
};

export function dartStatusMessage(code: string, fallback?: string): string {
  return DART_STATUS_KO[code] ?? fallback ?? `OpenDART 오류 (${code})`;
}

export function normalizeFnlttList(
  data: OpenDartFnlttResponse,
): FnlttSinglRow[] {
  const l = data.list;
  if (l == null) return [];
  return Array.isArray(l) ? l : [l];
}

export function parseDartAmount(raw: string | undefined): number | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (t === "" || t === "-") return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export const REPRT_OPTIONS = [
  { value: "11011", label: "사업보고서" },
  { value: "11012", label: "반기보고서" },
  { value: "11013", label: "1분기보고서" },
  { value: "11014", label: "3분기보고서" },
] as const;
