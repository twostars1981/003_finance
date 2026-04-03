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
    <div className="min-h-full min-w-0">
      <header className="sticky top-0 z-20 border-b border-kf-border bg-kf-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-3 sm:px-6">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md font-mono text-sm font-bold text-kf-bg"
            style={{ background: "linear-gradient(135deg, #00d4aa 0%, #00a882 100%)" }}
          >
            03
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-kf-muted">
              Research terminal
            </p>
            <h1 className="truncate text-sm font-semibold tracking-tight text-kf-text sm:text-base">
              003 Finance
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-5 px-3 py-5 sm:gap-6 sm:px-6 sm:py-8">
        <div className="space-y-1 border-b border-kf-border pb-5">
          <h2 className="text-lg font-semibold tracking-tight text-kf-text sm:text-xl">
            재무 데이터 · 시각화 · AI 인사이트
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-kf-muted">
            OpenDART 고유번호 기준 단일회사 주요계정을 조회합니다. 수치는 공시 API
            응답이며, 차트와 표로 바로 비교할 수 있습니다.
          </p>
        </div>

        <section className="rounded-lg border border-kf-border bg-kf-surface p-4 sm:p-5">
          <div className="mb-4 flex items-baseline justify-between gap-2 border-b border-kf-border pb-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-kf-muted">
              01 · Universe
            </h2>
            <span className="font-mono text-[10px] text-kf-dim">Search</span>
          </div>
          {corpLoadError && (
            <p className="mb-2 text-sm text-kf-danger">{corpLoadError}</p>
          )}
          <label className="block text-[11px] font-medium uppercase tracking-wide text-kf-muted">
            회사명 · 영문명 · 종목코드
          </label>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: 삼성전자, SAMSUNG, 005930"
            className="mt-1.5 w-full rounded-md border border-kf-border bg-kf-bg px-3 py-2.5 text-base text-kf-text outline-none placeholder:text-kf-dim focus:border-kf-accent focus:ring-1 focus:ring-kf-accent/35 sm:text-sm"
          />
          <p className="mt-2 text-xs text-kf-dim">
            즐겨찾기는 이 브라우저(localStorage)에만 저장됩니다.
          </p>

          {favorites.length > 0 && (
            <div className="mt-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-kf-muted">
                Watchlist
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {favorites.map((c) => (
                  <div
                    key={c.corp_code}
                    className="flex items-center gap-0.5 rounded-md border border-kf-accent/25 bg-kf-elevated pl-2.5 pr-1 text-sm"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(c);
                        setQuery(c.corp_name);
                      }}
                      className="py-1.5 pr-1 text-left font-medium text-kf-text hover:text-kf-accent"
                    >
                      {c.corp_name}
                      {c.stock_code ? (
                        <span className="ml-1 font-mono text-xs font-normal text-kf-muted">
                          {c.stock_code}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(c)}
                      className="rounded p-1.5 text-kf-dim hover:bg-kf-border hover:text-kf-text"
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
            <ul className="mt-2 max-h-56 overflow-auto rounded-md border border-kf-border bg-kf-bg">
              {matches.map((c) => {
                const isFav = favoriteCodes.has(c.corp_code);
                return (
                  <li
                    key={c.corp_code}
                    className="flex border-b border-kf-border last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(c);
                        setQuery(c.corp_name);
                      }}
                      className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-kf-elevated"
                    >
                      <span className="font-medium text-kf-text">
                        {c.corp_name}
                      </span>
                      <span className="font-mono text-xs text-kf-muted">
                        {c.corp_code}
                        {c.stock_code ? ` · ${c.stock_code}` : ""}
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
                          ? "text-kf-accent"
                          : "text-kf-dim hover:text-kf-accent"
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
            <p className="mt-2 text-sm text-kf-muted">검색 결과가 없습니다.</p>
          )}
          {selected && (
            <div className="mt-4 flex flex-col gap-2 border-t border-kf-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-kf-muted">
                선택{" "}
                <strong className="text-kf-text">{selected.corp_name}</strong>
                <span className="mx-1 text-kf-dim">·</span>
                <code className="rounded bg-kf-elevated px-1.5 py-0.5 font-mono text-xs text-kf-accent">
                  {selected.corp_code}
                </code>
              </p>
              <button
                type="button"
                onClick={() => toggleFavorite(selected)}
                className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  favoriteCodes.has(selected.corp_code)
                    ? "border-kf-accent/40 bg-kf-accent/10 text-kf-accent"
                    : "border-kf-border bg-kf-bg text-kf-muted hover:border-kf-accent/30 hover:text-kf-text"
                }`}
              >
                {favoriteCodes.has(selected.corp_code)
                  ? "Watchlist에서 제거"
                  : "Watchlist에 추가"}
              </button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-kf-border bg-kf-surface p-4 sm:p-5">
          <div className="mb-4 flex items-baseline justify-between gap-2 border-b border-kf-border pb-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-kf-muted">
              02 · Filing pull
            </h2>
            <span className="font-mono text-[10px] text-kf-dim">fnlttSinglAcnt</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-kf-muted">
                사업연도
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={bsnsYear}
                onChange={(e) =>
                  setBsnsYear(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                className="mt-1.5 w-full rounded-md border border-kf-border bg-kf-bg px-3 py-2.5 font-mono text-base text-kf-text outline-none focus:border-kf-accent focus:ring-1 focus:ring-kf-accent/35 sm:text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-kf-muted">
                보고서
              </label>
              <select
                value={reprtCode}
                onChange={(e) => setReprtCode(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-kf-border bg-kf-bg px-3 py-2.5 text-base text-kf-text outline-none focus:border-kf-accent focus:ring-1 focus:ring-kf-accent/35 sm:text-sm"
              >
                {REPRT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-kf-bg">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-kf-muted">
                개별/연결
              </label>
              <select
                value={fsDiv}
                onChange={(e) => setFsDiv(e.target.value as "CFS" | "OFS")}
                className="mt-1.5 w-full rounded-md border border-kf-border bg-kf-bg px-3 py-2.5 text-base text-kf-text outline-none focus:border-kf-accent focus:ring-1 focus:ring-kf-accent/35 sm:text-sm"
              >
                <option value="CFS" className="bg-kf-bg">
                  연결 (CFS)
                </option>
                <option value="OFS" className="bg-kf-bg">
                  개별 (OFS)
                </option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-kf-muted">
                표 구분
              </label>
              <select
                value={sjDiv}
                onChange={(e) => setSjDiv(e.target.value as "BS" | "IS")}
                className="mt-1.5 w-full rounded-md border border-kf-border bg-kf-bg px-3 py-2.5 text-base text-kf-text outline-none focus:border-kf-accent focus:ring-1 focus:ring-kf-accent/35 sm:text-sm"
              >
                <option value="BS" className="bg-kf-bg">
                  재무상태표 (BS)
                </option>
                <option value="IS" className="bg-kf-bg">
                  손익계산서 (IS)
                </option>
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void fetchFnltt()}
            disabled={!selected || fnlttLoading}
            className="mt-4 min-h-11 w-full rounded-md bg-kf-accent px-4 py-2.5 text-base font-semibold text-kf-bg transition-colors hover:bg-kf-accent-hover disabled:opacity-45 sm:w-auto sm:text-sm"
          >
            {fnlttLoading ? "조회 중…" : "OpenDART 조회"}
          </button>
          {fnlttError && (
            <p className="mt-3 text-sm text-kf-danger">{fnlttError}</p>
          )}
          {rceptNo && (
            <p className="mt-3 text-sm">
              <a
                href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-kf-link underline decoration-kf-border-strong/60 underline-offset-2 hover:text-kf-accent"
              >
                DART 원문 · 접수 {rceptNo}
              </a>
            </p>
          )}
        </section>

      {filteredFnltt.length > 0 && (
        <section className="space-y-5">
          <div className="min-w-0 rounded-lg border border-kf-border bg-kf-surface p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 border-b border-kf-border pb-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-kf-muted">
                  03 · Charts
                </h2>
                <p className="mt-1 text-xs text-kf-dim">
                  당기·전기 비교 · Recharts
                </p>
              </div>
              <div className="min-w-0 flex-1 sm:max-w-md">
                <label className="text-[11px] font-medium uppercase tracking-wide text-kf-muted">
                  뷰
                </label>
                <select
                  value={chartView}
                  onChange={(e) =>
                    setChartView(e.target.value as FinanceChartView)
                  }
                  className="mt-1 w-full rounded-md border border-kf-border bg-kf-bg px-3 py-2.5 text-base text-kf-text outline-none focus:border-kf-accent focus:ring-1 focus:ring-kf-accent/35 sm:text-sm"
                >
                  {CHART_VIEW_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} className="bg-kf-bg">
                      {o.label} — {o.hint}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <FinanceCharts data={chartData} view={chartView} />
          </div>

          <div className="min-w-0 rounded-lg border border-kf-border bg-kf-surface p-4 sm:p-5">
            <div className="mb-3 border-b border-kf-border pb-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-kf-muted">
                Line items
              </h2>
              <p className="mt-1 text-xs text-kf-dim sm:hidden">
                표는 가로 스크롤 · 모바일은 카드
              </p>
            </div>
            <div className="hidden sm:block">
              <div className="touch-pan-x overflow-x-auto overscroll-x-contain rounded-md border border-kf-border bg-kf-bg [-webkit-overflow-scrolling:touch]">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-kf-border bg-kf-elevated">
                      <th className="sticky left-0 z-10 border-r border-kf-border bg-kf-elevated py-2.5 pr-4 pl-3 text-[11px] font-semibold uppercase tracking-wide text-kf-muted">
                        계정
                      </th>
                      <th className="py-2.5 pr-4 text-[11px] font-semibold uppercase tracking-wide text-kf-muted">
                        당기
                      </th>
                      <th className="py-2.5 pr-3 text-[11px] font-semibold uppercase tracking-wide text-kf-muted">
                        전기
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFnltt.map((r) => (
                      <tr
                        key={`${r.account_nm}-${r.ord}-${r.fs_div}-${r.sj_div}`}
                        className="border-b border-kf-border/80 last:border-b-0"
                      >
                        <td className="sticky left-0 z-10 border-r border-kf-border bg-kf-bg py-2.5 pr-4 pl-3 align-top text-kf-text">
                          {r.account_nm}
                        </td>
                        <td className="max-w-[11rem] py-2.5 pr-4 align-top break-all font-mono text-xs text-kf-text tabular-nums">
                          {parseDartAmount(r.thstrm_amount) != null
                            ? formatWonFull(parseDartAmount(r.thstrm_amount)!)
                            : r.thstrm_amount}
                        </td>
                        <td className="max-w-[11rem] py-2.5 pr-3 align-top break-all font-mono text-xs text-kf-muted tabular-nums">
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
            <ul className="space-y-2 sm:hidden">
              {filteredFnltt.map((r) => (
                <li
                  key={`m-${r.account_nm}-${r.ord}-${r.fs_div}-${r.sj_div}`}
                  className="rounded-md border border-kf-border bg-kf-bg p-3"
                >
                  <div className="font-medium text-kf-text">{r.account_nm}</div>
                  <dl className="mt-2 grid grid-cols-1 gap-2 text-xs">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-kf-dim">
                        당기
                      </dt>
                      <dd className="break-all font-mono text-kf-text tabular-nums">
                        {parseDartAmount(r.thstrm_amount) != null
                          ? formatWonFull(parseDartAmount(r.thstrm_amount)!)
                          : r.thstrm_amount}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-kf-dim">
                        전기
                      </dt>
                      <dd className="break-all font-mono text-kf-muted tabular-nums">
                        {parseDartAmount(r.frmtrm_amount) != null
                          ? formatWonFull(parseDartAmount(r.frmtrm_amount)!)
                          : r.frmtrm_amount}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </div>

          <div className="min-w-0 rounded-lg border border-kf-border bg-kf-surface p-4 sm:p-5">
            <div className="mb-4 border-b border-kf-border pb-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-kf-muted">
                04 · AI narrative
              </h2>
              <p className="mt-1 text-xs text-kf-dim">Gemini · 현재 표 기준</p>
            </div>
            <button
              type="button"
              onClick={() => void runAnalyze()}
              disabled={analyzeLoading}
              className="min-h-11 w-full rounded-md border border-kf-accent/50 bg-kf-accent/10 px-4 py-2.5 text-base font-semibold text-kf-accent transition-colors hover:bg-kf-accent/20 disabled:opacity-45 sm:w-auto sm:text-sm"
            >
              {analyzeLoading ? "분석 중…" : "AI 분석 실행"}
            </button>
            {analyzeError && (
              <p className="mt-3 text-sm text-kf-danger">{analyzeError}</p>
            )}
            {analyzeText ? <AiAnalysisView content={analyzeText} /> : null}
          </div>
        </section>
      )}
      </main>
    </div>
  );
}
