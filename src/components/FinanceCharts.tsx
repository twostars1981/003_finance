"use client";

import { useMemo } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatWonCompact, formatWonFull } from "@/lib/format";

export type ChartRow = {
  name: string;
  당기: number;
  전기: number;
};

export type FinanceChartView =
  | "hbar"
  | "vbar"
  | "pie"
  | "donut"
  | "area"
  | "line"
  | "composed";

export const CHART_VIEW_OPTIONS: {
  value: FinanceChartView;
  label: string;
  hint: string;
}[] = [
  { value: "hbar", label: "가로 막대 (당기·전기)", hint: "계정이 많을 때 읽기 좋음" },
  { value: "vbar", label: "세로 막대 (당기·전기)", hint: "계정별 두 기간 비교" },
  { value: "line", label: "꺾은선 (추이)", hint: "계정 순서대로 당기·전기 연결" },
  { value: "area", label: "면적 (당기·전기)", hint: "규모 감각을 강조" },
  { value: "composed", label: "막대 + 증감률(%)", hint: "전기 대비 변화율(절대값 기준)" },
  { value: "pie", label: "파이 (당기 비중)", hint: "상위 계정의 당기 금액 비율" },
  { value: "donut", label: "도넛 (당기 비중)", hint: "파이와 동일, 중앙 여백" },
];

/** Koyfin-style: teal primary, cool neutrals, restrained accents */
const PIE_COLORS = [
  "#00d4aa",
  "#3d8bfd",
  "#7c9cb8",
  "#00a8e8",
  "#5ad8a6",
  "#9b87f5",
  "#c9a227",
  "#5a6578",
  "#2d8a7a",
];

function pieSlicesFromRows(rows: ChartRow[], maxSlices = 8) {
  const withPos = rows
    .map((r) => ({
      name: r.name,
      value: Math.abs(r.당기),
      raw: r.당기,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  if (withPos.length === 0) return [];
  const top = withPos.slice(0, maxSlices);
  const restSum = withPos
    .slice(maxSlices)
    .reduce((s, r) => s + r.value, 0);
  const out = top.map((r) => ({ name: r.name, value: r.value, raw: r.raw }));
  if (restSum > 0) {
    out.push({ name: "기타", value: restSum, raw: restSum });
  }
  return out;
}

function lineFriendlyData(rows: ChartRow[]) {
  return rows.map((r, i) => ({
    idx: i + 1,
    name: r.name,
    당기: r.당기,
    전기: r.전기,
  }));
}

function composedData(rows: ChartRow[]) {
  return rows.map((r) => {
    const prev = r.전기;
    const cur = r.당기;
    let pct: number | null = null;
    if (prev !== 0 && Number.isFinite(prev)) {
      pct = ((cur - prev) / Math.abs(prev)) * 100;
    }
    return {
      name: r.name,
      당기: cur,
      증감률: pct != null && Number.isFinite(pct) ? Math.round(pct * 10) / 10 : 0,
    };
  });
}

const tooltipStyle = {
  borderRadius: 6,
  border: "1px solid #2f3a4d",
  backgroundColor: "#141a24",
  color: "#eceff4",
  fontSize: 12,
  maxWidth: 320,
  whiteSpace: "normal" as const,
  wordBreak: "keep-all" as const,
  boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
};

const legendStyle = { color: "#8b939e", fontSize: 11, paddingTop: 6 };

/** 가로 막대 Y축: 한글 기준 글자당 약 11px + 여유 */
function categoryAxisWidthForNames(rows: ChartRow[]): number {
  const longest = rows.reduce((m, r) => Math.max(m, r.name.length), 0);
  return Math.min(360, Math.max(176, longest * 11 + 36));
}

/** 세로축(계정명) XAxis: 회전 라벨이 잘리지 않도록 하단·높이 확보 */
function bottomSpaceForRotatedNames(rows: ChartRow[]): {
  marginBottom: number;
  xAxisHeight: number;
} {
  const longest = rows.reduce((m, r) => Math.max(m, r.name.length), 0);
  return {
    marginBottom: Math.min(220, Math.max(100, 48 + longest * 5)),
    xAxisHeight: Math.min(160, Math.max(88, 36 + longest * 4)),
  };
}

function shortAxisName(name: string, maxChars: number): string {
  const s = String(name);
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(1, maxChars - 1))}…`;
}

type Props = {
  data: ChartRow[];
  view: FinanceChartView;
};

const scrollXClass =
  "touch-pan-x overscroll-x-contain [-webkit-overflow-scrolling:touch]";

export function FinanceCharts({ data, view }: Props) {
  const isNarrow = useMediaQuery("(max-width: 639px)");

  const pieData = useMemo(() => pieSlicesFromRows(data), [data]);
  const lineData = useMemo(() => lineFriendlyData(data), [data]);
  const compData = useMemo(() => composedData(data), [data]);

  const yCategoryW = useMemo(() => categoryAxisWidthForNames(data), [data]);
  const rotatedBottom = useMemo(() => bottomSpaceForRotatedNames(data), [data]);

  const yCategoryWDisplay = isNarrow
    ? Math.min(yCategoryW, 120)
    : yCategoryW;
  const nameTickMax = isNarrow ? 10 : 14;
  const hbarNameMax = isNarrow ? 12 : 28;

  if (data.length === 0) return null;

  const rowH = isNarrow ? 32 : 36;
  const h = Math.min(720, Math.max(260, data.length * rowH + 88));
  const vBarHeight = Math.min(640, Math.max(320, 140 + data.length * (isNarrow ? 28 : 32)));

  if (view === "pie" || view === "donut") {
    if (pieData.length === 0) {
      return (
        <p className="text-sm text-kf-muted">
          파이·도넛 차트를 그리려면 당기 금액이 0보다 큰 계정이 필요합니다.
        </p>
      );
    }
    const inner = view === "donut" ? (isNarrow ? "35%" : "45%") : 0;
    return (
      <div className="w-full min-w-0 max-w-full rounded-md border border-kf-border bg-kf-bg p-3 sm:p-4">
        <h3 className="mb-1 text-sm font-semibold text-kf-text">
          {view === "donut" ? "도넛" : "파이"} — 당기 비중
        </h3>
        <p className="mb-3 text-xs text-kf-dim">
          절댓값 기준 · 툴팁에 부호 표시
        </p>
        <ResponsiveContainer width="100%" height={isNarrow ? 500 : 420}>
          <PieChart
            margin={
              isNarrow
                ? { top: 4, right: 4, left: 4, bottom: 8 }
                : { top: 12, right: 8, bottom: 12, left: 8 }
            }
          >
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy={isNarrow ? "34%" : "50%"}
              outerRadius={isNarrow ? 92 : 118}
              innerRadius={inner}
              paddingAngle={1}
              label={false}
            >
              {pieData.map((_, i) => (
                <Cell
                  key={i}
                  fill={PIE_COLORS[i % PIE_COLORS.length]}
                  stroke="#0a0d12"
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, _n, item) => {
                const raw = (item?.payload as { raw?: number })?.raw;
                const v = Number(value ?? 0);
                const label =
                  raw != null ? formatWonFull(raw) : formatWonFull(v);
                return [label, "당기"];
              }}
              labelFormatter={(_, payload) =>
                String((payload?.[0]?.payload as { name?: string })?.name ?? "")
              }
              contentStyle={tooltipStyle}
            />
            <Legend
              layout={isNarrow ? "horizontal" : "vertical"}
              align={isNarrow ? "center" : "right"}
              verticalAlign={isNarrow ? "bottom" : "middle"}
              wrapperStyle={
                isNarrow
                  ? {
                      width: "100%",
                      paddingTop: 4,
                      fontSize: 10,
                      lineHeight: 1.35,
                      maxHeight: 200,
                      overflowY: "auto",
                      color: "#8b939e",
                    }
                  : {
                      maxHeight: 380,
                      overflowY: "auto",
                      width: "52%",
                      paddingLeft: 8,
                      fontSize: 11,
                      lineHeight: 1.35,
                      color: "#8b939e",
                    }
              }
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (view === "vbar") {
    return (
      <div className="w-full min-w-0 max-w-full rounded-md border border-kf-border bg-kf-bg p-3 sm:p-4">
        <h3 className="mb-3 text-sm font-semibold text-kf-text">
          세로 막대 — 계정별 당기·전기
        </h3>
        <div className={`w-full overflow-x-auto pb-2 ${scrollXClass}`}>
          <div style={{ minWidth: Math.min(1200, 420 + data.length * 36) }}>
            <ResponsiveContainer width="100%" height={vBarHeight}>
              <BarChart
                data={data}
                margin={{
                  top: 16,
                  right: 20,
                  left: 16,
                  bottom: rotatedBottom.marginBottom,
                }}
              >
            <CartesianGrid strokeDasharray="3 3" className="stroke-kf-border/90" />
            <XAxis
              dataKey="name"
              angle={-38}
              textAnchor="end"
              height={rotatedBottom.xAxisHeight}
              interval={0}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => shortAxisName(String(v), nameTickMax)}
              className="fill-kf-muted"
            />
            <YAxis
              width={isNarrow ? 56 : 72}
              tickFormatter={(v) => formatWonCompact(Number(v))}
              className="text-xs fill-kf-dim"
            />
            <Tooltip
              formatter={(value) => formatWonFull(Number(value ?? 0))}
              contentStyle={tooltipStyle}
            />
            <Legend wrapperStyle={legendStyle} />
            <Bar dataKey="당기" fill="#00d4aa" radius={[4, 4, 0, 0]} />
            <Bar dataKey="전기" fill="#5a6578" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  if (view === "area") {
    return (
      <div className="w-full min-w-0 max-w-full rounded-md border border-kf-border bg-kf-bg p-3 sm:p-4">
        <h3 className="mb-3 text-sm font-semibold text-kf-text">
          면적 차트 — 당기·전기
        </h3>
        <div className={`w-full overflow-x-auto pb-2 ${scrollXClass}`}>
          <div style={{ minWidth: Math.min(1200, 420 + data.length * 36) }}>
            <ResponsiveContainer width="100%" height={vBarHeight}>
              <AreaChart
                data={data}
                margin={{
                  top: 16,
                  right: 20,
                  left: 16,
                  bottom: rotatedBottom.marginBottom,
                }}
              >
            <CartesianGrid strokeDasharray="3 3" className="stroke-kf-border/90" />
            <XAxis
              dataKey="name"
              angle={-38}
              textAnchor="end"
              height={rotatedBottom.xAxisHeight}
              interval={0}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => shortAxisName(String(v), nameTickMax)}
            />
            <YAxis
              width={isNarrow ? 56 : 72}
              tickFormatter={(v) => formatWonCompact(Number(v))}
            />
            <Tooltip
              formatter={(value) => formatWonFull(Number(value ?? 0))}
              contentStyle={tooltipStyle}
            />
            <Legend wrapperStyle={legendStyle} />
            <Area
              type="monotone"
              dataKey="당기"
              stroke="#00a882"
              fill="#00d4aa"
              fillOpacity={0.28}
            />
            <Area
              type="monotone"
              dataKey="전기"
              stroke="#5a6578"
              fill="#7c9cb8"
              fillOpacity={0.22}
            />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  if (view === "line") {
    return (
      <div className="w-full min-w-0 max-w-full rounded-md border border-kf-border bg-kf-bg p-3 sm:p-4">
        <h3 className="mb-3 text-sm font-semibold text-kf-text">
          꺾은선 — 계정 순서대로 당기·전기
        </h3>
        <div className={`w-full min-w-0 ${scrollXClass} overflow-x-auto`}>
          <ResponsiveContainer width="100%" height={isNarrow ? Math.min(vBarHeight, 380) : vBarHeight} minWidth={280}>
            <LineChart
              data={lineData}
              margin={{
                top: 16,
                right: isNarrow ? 12 : 20,
                left: isNarrow ? 8 : 20,
                bottom: isNarrow ? 44 : 36,
              }}
            >
            <CartesianGrid strokeDasharray="3 3" className="stroke-kf-border/90" />
            <XAxis
              dataKey="idx"
              tickFormatter={(v) => `#${v}`}
              label={{
                value: isNarrow
                  ? "순서(툴팁에 계정명)"
                  : "계정 순서(정렬) — 툴팁에 전체 계정명",
                position: "insideBottom",
                offset: -2,
                style: { fontSize: isNarrow ? 9 : 11, fill: "#8b939e" },
              }}
            />
            <YAxis
              width={isNarrow ? 52 : 68}
              tickFormatter={(v) => formatWonCompact(Number(v))}
            />
            <Tooltip
              formatter={(value) => formatWonFull(Number(value ?? 0))}
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as { name?: string; idx?: number };
                return p?.name ? `${p.name} (순서 ${p.idx})` : "";
              }}
              contentStyle={tooltipStyle}
            />
            <Legend wrapperStyle={legendStyle} />
            <Line type="monotone" dataKey="당기" stroke="#00d4aa" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="전기" stroke="#7c9cb8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  if (view === "composed") {
    return (
      <div className="w-full min-w-0 max-w-full rounded-md border border-kf-border bg-kf-bg p-3 sm:p-4">
        <h3 className="mb-1 text-sm font-semibold text-kf-text">
          막대(당기) + 선(전기 대비 증감률 %)
        </h3>
        <p className="mb-3 text-xs text-kf-dim">
          전기가 0이면 증감률은 0으로 표시됩니다.
        </p>
        <div className={`w-full overflow-x-auto pb-2 ${scrollXClass}`}>
          <div style={{ minWidth: Math.min(1200, 420 + data.length * 36) }}>
            <ResponsiveContainer width="100%" height={vBarHeight}>
              <ComposedChart
                data={compData}
                margin={{
                  top: 16,
                  right: isNarrow ? 28 : 36,
                  left: isNarrow ? 4 : 12,
                  bottom: rotatedBottom.marginBottom,
                }}
              >
            <CartesianGrid strokeDasharray="3 3" className="stroke-kf-border/90" />
            <XAxis
              dataKey="name"
              angle={-38}
              textAnchor="end"
              height={rotatedBottom.xAxisHeight}
              interval={0}
              tick={{ fontSize: isNarrow ? 9 : 10 }}
              tickFormatter={(v) => shortAxisName(String(v), nameTickMax)}
            />
            <YAxis
              yAxisId="left"
              width={isNarrow ? 52 : 72}
              tickFormatter={(v) => formatWonCompact(Number(v))}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              width={isNarrow ? 36 : 48}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => {
                if (name === "증감률")
                  return [`${Number(value ?? 0)}%`, "전기 대비"];
                return [formatWonFull(Number(value ?? 0)), String(name ?? "")];
              }}
            />
            <Legend wrapperStyle={legendStyle} />
            <Bar yAxisId="left" dataKey="당기" fill="#00d4aa" radius={[4, 4, 0, 0]} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="증감률"
              stroke="#ffb020"
              strokeWidth={2}
              dot={{ r: 2 }}
            />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  /* hbar — default */
  return (
    <div className="w-full min-w-0 max-w-full rounded-md border border-kf-border bg-kf-bg p-3 sm:p-4">
      <h3 className="mb-3 text-sm font-semibold text-kf-text">
        가로 막대 — 당기 vs 전기
      </h3>
      <div className={`w-full overflow-x-auto pb-2 ${scrollXClass}`}>
        <div style={{ minWidth: Math.min(1100, 280 + yCategoryWDisplay + data.length * 8) }}>
          <ResponsiveContainer width="100%" height={h} minWidth={260}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{
            top: 16,
            right: isNarrow ? 20 : 28,
            left: isNarrow ? 4 : 12,
            bottom: 16,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-kf-border/90" />
          <XAxis
            type="number"
            tickFormatter={(v) => formatWonCompact(Number(v))}
            className="text-xs fill-kf-dim"
          />
          <YAxis
            type="category"
            dataKey="name"
            width={yCategoryWDisplay}
            tick={{ fontSize: isNarrow ? 9 : 10 }}
            tickFormatter={(v) => shortAxisName(String(v), hbarNameMax)}
            className="text-xs fill-kf-muted"
          />
          <Tooltip
            formatter={(value) => formatWonFull(Number(value ?? 0))}
            labelFormatter={(label) => String(label)}
            contentStyle={tooltipStyle}
          />
          <Legend wrapperStyle={legendStyle} />
          <Bar dataKey="당기" fill="#00d4aa" name="당기" radius={[0, 4, 4, 0]} />
          <Bar dataKey="전기" fill="#5a6578" name="전기" radius={[0, 4, 4, 0]} />
        </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
