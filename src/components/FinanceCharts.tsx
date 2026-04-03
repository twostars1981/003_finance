"use client";

import { useMemo } from "react";
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

const PIE_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#4f46e5",
  "#64748b",
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
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  fontSize: 12,
  maxWidth: 320,
  whiteSpace: "normal" as const,
  wordBreak: "keep-all" as const,
};

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

export function FinanceCharts({ data, view }: Props) {
  const pieData = useMemo(() => pieSlicesFromRows(data), [data]);
  const lineData = useMemo(() => lineFriendlyData(data), [data]);
  const compData = useMemo(() => composedData(data), [data]);

  const yCategoryW = useMemo(() => categoryAxisWidthForNames(data), [data]);
  const rotatedBottom = useMemo(() => bottomSpaceForRotatedNames(data), [data]);

  if (data.length === 0) return null;

  const h = Math.min(720, Math.max(280, data.length * 36 + 100));
  const vBarHeight = Math.min(640, Math.max(360, 160 + data.length * 32));

  if (view === "pie" || view === "donut") {
    if (pieData.length === 0) {
      return (
        <p className="text-sm text-zinc-500">
          파이·도넛 차트를 그리려면 당기 금액이 0보다 큰 계정이 필요합니다.
        </p>
      );
    }
    const inner = view === "donut" ? "45%" : 0;
    return (
      <div className="w-full rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {view === "donut" ? "도넛" : "파이"} — 당기 금액 비중 (상위 계정)
        </h3>
        <p className="mb-3 text-xs text-zinc-500">
          표시 금액은 절댓값 기준이며, 툴팁에 실제 부호를 표시합니다.
        </p>
        <ResponsiveContainer width="100%" height={420}>
          <PieChart margin={{ top: 12, right: 8, bottom: 12, left: 8 }}>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="38%"
              cy="50%"
              outerRadius={118}
              innerRadius={inner}
              paddingAngle={1}
              label={false}
            >
              {pieData.map((_, i) => (
                <Cell
                  key={i}
                  fill={PIE_COLORS[i % PIE_COLORS.length]}
                  stroke="var(--background, #fff)"
                  className="dark:stroke-zinc-950"
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
              layout="vertical"
              align="right"
              verticalAlign="middle"
              wrapperStyle={{
                maxHeight: 380,
                overflowY: "auto",
                width: "52%",
                paddingLeft: 8,
                fontSize: 11,
                lineHeight: 1.35,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (view === "vbar") {
    return (
      <div className="w-full rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          세로 막대 — 계정별 당기·전기
        </h3>
        <div className="w-full overflow-x-auto pb-2">
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
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
            <XAxis
              dataKey="name"
              angle={-38}
              textAnchor="end"
              height={rotatedBottom.xAxisHeight}
              interval={0}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => shortAxisName(String(v), 14)}
              className="fill-zinc-600"
            />
            <YAxis
              width={72}
              tickFormatter={(v) => formatWonCompact(Number(v))}
              className="text-xs fill-zinc-500"
            />
            <Tooltip
              formatter={(value) => formatWonFull(Number(value ?? 0))}
              contentStyle={tooltipStyle}
            />
            <Legend />
            <Bar dataKey="당기" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="전기" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  if (view === "area") {
    return (
      <div className="w-full rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          면적 차트 — 당기·전기
        </h3>
        <div className="w-full overflow-x-auto pb-2">
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
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
            <XAxis
              dataKey="name"
              angle={-38}
              textAnchor="end"
              height={rotatedBottom.xAxisHeight}
              interval={0}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => shortAxisName(String(v), 14)}
            />
            <YAxis
              width={72}
              tickFormatter={(v) => formatWonCompact(Number(v))}
            />
            <Tooltip
              formatter={(value) => formatWonFull(Number(value ?? 0))}
              contentStyle={tooltipStyle}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="당기"
              stroke="#1d4ed8"
              fill="#3b82f6"
              fillOpacity={0.35}
            />
            <Area
              type="monotone"
              dataKey="전기"
              stroke="#64748b"
              fill="#94a3b8"
              fillOpacity={0.35}
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
      <div className="w-full rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          꺾은선 — 계정 순서대로 당기·전기
        </h3>
        <ResponsiveContainer width="100%" height={vBarHeight}>
          <LineChart
            data={lineData}
            margin={{ top: 16, right: 20, left: 20, bottom: 36 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
            <XAxis
              dataKey="idx"
              tickFormatter={(v) => `#${v}`}
              label={{
                value: "계정 순서(정렬) — 툴팁에 전체 계정명",
                position: "insideBottom",
                offset: -2,
                style: { fontSize: 11, fill: "#71717a" },
              }}
            />
            <YAxis
              width={68}
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
            <Legend />
            <Line type="monotone" dataKey="당기" stroke="#2563eb" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="전기" stroke="#94a3b8" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (view === "composed") {
    return (
      <div className="w-full rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          막대(당기) + 선(전기 대비 증감률 %)
        </h3>
        <p className="mb-3 text-xs text-zinc-500">
          전기가 0이면 증감률은 0으로 표시됩니다.
        </p>
        <div className="w-full overflow-x-auto pb-2">
          <div style={{ minWidth: Math.min(1200, 420 + data.length * 36) }}>
            <ResponsiveContainer width="100%" height={vBarHeight}>
              <ComposedChart
                data={compData}
                margin={{
                  top: 16,
                  right: 36,
                  left: 12,
                  bottom: rotatedBottom.marginBottom,
                }}
              >
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
            <XAxis
              dataKey="name"
              angle={-38}
              textAnchor="end"
              height={rotatedBottom.xAxisHeight}
              interval={0}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => shortAxisName(String(v), 14)}
            />
            <YAxis
              yAxisId="left"
              width={72}
              tickFormatter={(v) => formatWonCompact(Number(v))}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              width={48}
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
            <Legend />
            <Bar yAxisId="left" dataKey="당기" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="증감률"
              stroke="#f97316"
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
    <div className="w-full rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        가로 막대 — 당기 vs 전기
      </h3>
      <div className="w-full overflow-x-auto pb-2">
        <div style={{ minWidth: Math.min(1100, 320 + yCategoryW + data.length * 8) }}>
          <ResponsiveContainer width="100%" height={h}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 16, right: 28, left: 12, bottom: 16 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
          <XAxis
            type="number"
            tickFormatter={(v) => formatWonCompact(Number(v))}
            className="text-xs fill-zinc-500"
          />
          <YAxis
            type="category"
            dataKey="name"
            width={yCategoryW}
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => shortAxisName(String(v), 28)}
            className="text-xs fill-zinc-600"
          />
          <Tooltip
            formatter={(value) => formatWonFull(Number(value ?? 0))}
            labelFormatter={(label) => String(label)}
            contentStyle={tooltipStyle}
          />
          <Legend />
          <Bar dataKey="당기" fill="#2563eb" name="당기" radius={[0, 4, 4, 0]} />
          <Bar dataKey="전기" fill="#94a3b8" name="전기" radius={[0, 4, 4, 0]} />
        </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
