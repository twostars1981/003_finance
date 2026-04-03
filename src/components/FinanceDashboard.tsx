"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dartStatusMessage,
  normalizeCorpCode,
  normalizeFnlttList,
  parseDartAmount,
  REPRT_OPTIONS,
} from "@/lib/dart";
import {
  readFavoriteCorporates,
  toggleFavoriteInList,
  writeFavoriteCorporates,
} from "@/lib/favorite-corps";
import { formatWonFull } from "@/lib/format";
import type { Corporate, FnlttSinglRow, OpenDartFnlttResponse } from "@/lib/types";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { AiAnalysisView } from "./AiAnalysisView";
import {
  CHART_VIEW_OPTIONS,
  FinanceCharts,
  type ChartRow,
  type FinanceChartView,
} from "./FinanceCharts";

const CORP_JSON = "/data/corporates.json";

function defaultBsnsYear(): string {
  const y = new Date().getFullYear();
  return String(Math.max(2015, y - 1));
}

export function FinanceDashboard() {
  const [corporates, setCorporates] = useState<Corporate[] | null>(null);
  const [corpLoadError, setCorpLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 280);
  const [selected, setSelected] = useState<Corporate | null>(null);

  const [bsnsYear, setBsnsYear] = useState(defaultBsnsYear);
  const [reprtCode, setReprtCode] = useState("11011");
  const [fsDiv, setFsDiv] = useState<"CFS" | "OFS">("CFS");
  const [sjDiv, setSjDiv] = useState<"BS" | "IS">("BS");
  const [chartView, setChartView] = useState<FinanceChartView>("hbar");

  const [fnlttLoading, setFnlttLoading] = useState(false);
  const [fnlttError, setFnlttError] = useState<string | null>(null);
  const [fnlttRows, setFnlttRows] = useState<FnlttSinglRow[]>([]);

  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeText, setAnalyzeText] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [favorites, setFavorites] = useState<Corporate[]>([]);

  useEffect(() => {
    setFavorites(readFavoriteCorporates());
  }, []);

  const favoriteCodes = useMemo(
    () => new Set(favorites.map((f) => f.corp_code)),
    [favorites],
  );

  const toggleFavorite = useCallback((c: Corporate) => {
    setFavorites((prev) => {
      const next = toggleFavoriteInList(prev, c);
      writeFavoriteCorporates(next);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(CORP_JSON);
        if (!res.ok) {
          throw new Error(`회사 목록을 불러오지 못했습니다 (${res.status}). npm run build:corp 실행 후 다시 빌드하세요.`);
        }
        const data = (await res.json()) as Corporate[];
        if (!cancelled) setCorporates(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) {
          setCorpLoadError(
            e instanceof Error ? e.message : "회사 목록 로드 실패",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(() => {
    if (!corporates || !debouncedQuery.trim()) return [];
    const q = debouncedQuery.trim().toLowerCase();
    const out: Corporate[] = [];
    for (const c of corporates) {
      if (
        c.corp_name.includes(debouncedQuery.trim()) ||
        c.corp_name.toLowerCase().includes(q) ||
        c.corp_eng_name.toLowerCase().includes(q) ||
        c.stock_code.includes(debouncedQuery.trim())
      ) {
        out.push(c);
        if (out.length >= 80) break;
      }
    }
    return out;
  }, [corporates, debouncedQuery]);

  const filteredFnltt = useMemo(() => {
    return fnlttRows
      .filter((r) => r.fs_div === fsDiv && r.sj_div === sjDiv)
      .sort((a, b) => Number(a.ord) - Number(b.ord));
  }, [fnlttRows, fsDiv, sjDiv]);

  const chartData: ChartRow[] = useMemo(() => {
    return filteredFnltt
      .map((r) => {
        const cur = parseDartAmount(r.thstrm_amount);
        const prev = parseDartAmount(r.frmtrm_amount);
        if (cur == null && prev == null) return null;
        return {
          name: r.account_nm,
          당기: cur ?? 0,
          전기: prev ?? 0,
        };
      })
      .filter((x): x is ChartRow => x != null);
  }, [filteredFnltt]);

  const rceptNo = filteredFnltt[0]?.rcept_no;

  const fetchFnltt = useCallback(async () => {
    if (!selected) {
      setFnlttError("회사를 먼저 선택하세요.");
      return;
    }
    setFnlttError(null);
    setFnlttLoading(true);
    setFnlttRows([]);
    setAnalyzeText(null);
    setAnalyzeError(null);
    try {
      const corpCode = normalizeCorpCode(selected.corp_code);
      if (corpCode.length !== 8) {
        throw new Error("고유번호(corp_code)가 올바르지 않습니다. 회사를 다시 선택하세요.");
      }
      const params = new URLSearchParams({
        corp_code: corpCode,
        bsns_year: bsnsYear.trim(),
        reprt_code: reprtCode,
      });
      const res = await fetch(`/api/financials?${params}`);
      const data = (await res.json()) as OpenDartFnlttResponse & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : `요청 실패 (${res.status})`,
        );
      }
      if (data.status !== "000") {
        throw new Error(
          dartStatusMessage(String(data.status), data.message),
        );
      }
      setFnlttRows(normalizeFnlttList(data));
    } catch (e) {
      setFnlttError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setFnlttLoading(false);
    }
  }, [selected, bsnsYear, reprtCode]);

  const runAnalyze = useCallback(async () => {
    if (!selected || filteredFnltt.length === 0) {
      setAnalyzeError("분석할 재무 데이터가 없습니다. 먼저 조회하세요.");
      return;
    }
    setAnalyzeLoading(true);
    setAnalyzeError(null);
    setAnalyzeText(null);
    const reprtLabel =
      REPRT_OPTIONS.find((o) => o.value === reprtCode)?.label ?? reprtCode;
    const fsLabel = fsDiv === "CFS" ? "연결재무제표" : "개별재무제표";
    const sjLabel = sjDiv === "BS" ? "재무상태표" : "손익계산서";
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: selected.corp_name,
          corpCode: selected.corp_code,
          bsnsYear,
          reprtLabel,
          fsLabel,
          sjLabel,
          rows: filteredFnltt.map((r) => ({
            account_nm: r.account_nm,
            thstrm_amount: r.thstrm_amount,
            frmtrm_amount: r.frmtrm_amount,
          })),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        text?: string;
        error?: string;
        modelUsed?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "분석 요청 실패");
      }
      const suffix = data.modelUsed
        ? `\n\n— 사용 모델: ${data.modelUsed}`
        : "";
      setAnalyzeText((data.text ?? "") + suffix);
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : "분석 실패");
    } finally {
      setAnalyzeLoading(false);
    }
  }, [selected, filteredFnltt, bsnsYear, reprtCode, fsDiv, sjDiv]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          재무 데이터 검색·시각화·AI 분석
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          OpenDART 고유번호로 회사를 고른 뒤 단일회사 주요계정을 조회합니다. 모든
          수치는 공시 API 실시간 응답입니다.
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          1. 회사 검색
        </h2>
        {corpLoadError && (
          <p className="mb-2 text-sm text-red-600 dark:text-red-400">
            {corpLoadError}
          </p>
        )}
        <label className="block text-xs font-medium text-zinc-500">
          회사명 · 영문명 · 종목코드
        </label>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="예: 삼성전자, SAMSUNG, 005930"
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="mt-2 text-xs text-zinc-500">
          즐겨찾기는 이 브라우저에만 저장됩니다.
        </p>

        {favorites.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              즐겨찾기
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {favorites.map((c) => (
                <div
                  key={c.corp_code}
                  className="flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 pl-3 pr-1 text-sm dark:border-amber-900/60 dark:bg-amber-950/40"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(c);
                      setQuery(c.corp_name);
                    }}
                    className="py-1.5 pr-1 font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                  >
                    {c.corp_name}
                    {c.stock_code ? (
                      <span className="ml-1 font-normal text-zinc-500">
                        ({c.stock_code})
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(c)}
                    className="rounded-full p-1.5 text-zinc-500 hover:bg-amber-200/80 hover:text-zinc-800 dark:hover:bg-amber-900/50 dark:hover:text-zinc-200"
                    aria-label={`${c.corp_name} 즐겨찾기 해제`}
                    title="즐겨찾기 해제"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {debouncedQuery.trim() && matches.length > 0 && (
          <ul className="mt-2 max-h-56 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            {matches.map((c) => {
              const isFav = favoriteCodes.has(c.corp_code);
              return (
                <li
                  key={c.corp_code}
                  className="flex border-b border-zinc-100 last:border-b-0 dark:border-zinc-800/80"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(c);
                      setQuery(c.corp_name);
                    }}
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {c.corp_name}
                    </span>
                    <span className="text-xs text-zinc-500">
                      고유번호 {c.corp_code}
                      {c.stock_code ? ` · 종목 ${c.stock_code}` : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      toggleFavorite(c);
                    }}
                    className={`shrink-0 px-3 text-lg leading-none transition-colors ${
                      isFav
                        ? "text-amber-500 hover:text-amber-600"
                        : "text-zinc-300 hover:text-amber-400"
                    }`}
                    aria-label={
                      isFav
                        ? `${c.corp_name} 즐겨찾기 해제`
                        : `${c.corp_name} 즐겨찾기 추가`
                    }
                    title={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                  >
                    {isFav ? "★" : "☆"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {debouncedQuery.trim() && matches.length === 0 && corporates && (
          <p className="mt-2 text-sm text-zinc-500">검색 결과가 없습니다.</p>
        )}
        {selected && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              선택됨:{" "}
              <strong>{selected.corp_name}</strong> (고유번호{" "}
              <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
                {selected.corp_code}
              </code>
              )
            </p>
            <button
              type="button"
              onClick={() => toggleFavorite(selected)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                favoriteCodes.has(selected.corp_code)
                  ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-amber-300 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
              }`}
            >
              {favoriteCodes.has(selected.corp_code)
                ? "★ 즐겨찾기 해제"
                : "☆ 즐겨찾기 추가"}
            </button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          2. 재무 조회 (단일회사 주요계정)
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs font-medium text-zinc-500">사업연도</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={bsnsYear}
              onChange={(e) =>
                setBsnsYear(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500">보고서</label>
            <select
              value={reprtCode}
              onChange={(e) => setReprtCode(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {REPRT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500">
              개별/연결
            </label>
            <select
              value={fsDiv}
              onChange={(e) => setFsDiv(e.target.value as "CFS" | "OFS")}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="CFS">연결 (CFS)</option>
              <option value="OFS">개별 (OFS)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500">표 구분</label>
            <select
              value={sjDiv}
              onChange={(e) => setSjDiv(e.target.value as "BS" | "IS")}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="BS">재무상태표 (BS)</option>
              <option value="IS">손익계산서 (IS)</option>
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void fetchFnltt()}
          disabled={!selected || fnlttLoading}
          className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {fnlttLoading ? "조회 중…" : "OpenDART에서 조회"}
        </button>
        {fnlttError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">
            {fnlttError}
          </p>
        )}
        {rceptNo && (
          <p className="mt-3 text-sm">
            <a
              href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-600 underline dark:text-blue-400"
            >
              DART 공시 원문 보기 (접수번호 {rceptNo})
            </a>
          </p>
        )}
      </section>

      {filteredFnltt.length > 0 && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              3. 시각화
            </h2>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex-1">
                <label className="text-xs font-medium text-zinc-500">
                  차트 종류
                </label>
                <select
                  value={chartView}
                  onChange={(e) =>
                    setChartView(e.target.value as FinanceChartView)
                  }
                  className="mt-1 w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {CHART_VIEW_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label} — {o.hint}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <FinanceCharts data={chartData} view={chartView} />
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              계정 목록
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th className="py-2 pr-4 font-medium">계정명</th>
                    <th className="py-2 pr-4 font-medium">당기</th>
                    <th className="py-2 font-medium">전기</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFnltt.map((r) => (
                    <tr
                      key={`${r.account_nm}-${r.ord}-${r.fs_div}-${r.sj_div}`}
                      className="border-b border-zinc-100 dark:border-zinc-900"
                    >
                      <td className="py-2 pr-4 align-top">{r.account_nm}</td>
                      <td className="py-2 pr-4 align-top font-mono text-xs">
                        {parseDartAmount(r.thstrm_amount) != null
                          ? formatWonFull(parseDartAmount(r.thstrm_amount)!)
                          : r.thstrm_amount}
                      </td>
                      <td className="py-2 align-top font-mono text-xs">
                        {parseDartAmount(r.frmtrm_amount) != null
                          ? formatWonFull(parseDartAmount(r.frmtrm_amount)!)
                          : r.frmtrm_amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              4. AI 쉬운 해설 (Gemini)
            </h2>
            <button
              type="button"
              onClick={() => void runAnalyze()}
              disabled={analyzeLoading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {analyzeLoading ? "분석 중…" : "AI 분석 시작"}
            </button>
            {analyzeError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                {analyzeError}
              </p>
            )}
            {analyzeText ? <AiAnalysisView content={analyzeText} /> : null}
          </div>
        </section>
      )}
    </div>
  );
}
