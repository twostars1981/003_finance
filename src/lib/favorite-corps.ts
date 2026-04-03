import type { Corporate } from "./types";

const STORAGE_KEY = "003_finance_favorite_corps";
const MAX_FAVORITES = 40;

export function readFavoriteCorporates(): Corporate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is Corporate =>
          x != null &&
          typeof (x as Corporate).corp_code === "string" &&
          typeof (x as Corporate).corp_name === "string",
      )
      .slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

export function writeFavoriteCorporates(list: Corporate[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(list.slice(0, MAX_FAVORITES)),
    );
  } catch {
    /* quota / private mode */
  }
}

/** 이미 있으면 제거, 없으면 맨 앞에 추가 */
export function toggleFavoriteInList(list: Corporate[], c: Corporate): Corporate[] {
  const exists = list.some((x) => x.corp_code === c.corp_code);
  if (exists) {
    return list.filter((x) => x.corp_code !== c.corp_code);
  }
  const merged: Corporate = {
    corp_code: c.corp_code,
    corp_name: c.corp_name,
    corp_eng_name: c.corp_eng_name ?? "",
    stock_code: c.stock_code ?? "",
    modify_date: c.modify_date ?? "",
  };
  return [merged, ...list.filter((x) => x.corp_code !== c.corp_code)].slice(
    0,
    MAX_FAVORITES,
  );
}
