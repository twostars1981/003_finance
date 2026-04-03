export function formatWonCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}조`;
  if (abs >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(0)}만`;
  return `${n.toLocaleString("ko-KR")}`;
}

export function formatWonFull(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}
