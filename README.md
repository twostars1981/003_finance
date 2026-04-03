# 재무 데이터 검색·시각화·AI 분석

Next.js(App Router) + OpenDART(단일회사 주요계정) + Recharts + Gemini.

## 준비

1. OpenDART에서 받은 **CORPCODE.xml** 을 `data/corp.xml` 로 넣습니다.
2. 회사 목록 JSON 생성:

   ```bash
   npm run build:corp
   ```

3. 환경 변수: `.env.example` 을 참고해 **`.env.local`** 을 만듭니다.

   - `OPENDART_CRTFC_KEY` — OpenDART API 인증키
   - `GEMINI_API_KEY` — Google AI API 키
   - `GEMINI_MODEL` — 선택 (기본 `gemini-2.5-flash`; 429 할당량 오류 시 서버가 다른 모델도 순서대로 시도)

### Gemini 429 / 할당량

무료 티어는 모델·프로젝트별 일일/분당 한도가 있습니다. `429` 또는 `Quota exceeded`가 나오면 잠시 후 재시도하거나 [Google AI Studio](https://aistudio.google.com/)에서 결제·한도를 확인하세요. [한도 문서](https://ai.google.dev/gemini-api/docs/rate-limits).

키는 **저장소에 커밋하지 마세요.**

## 로컬 실행

```bash
npm install
npm run build:corp
npm run dev
```

`next build` 전에 `prebuild` 로 `build:corp` 가 자동 실행됩니다. `data/corp.xml` 이 없으면 빌드가 실패합니다.

## Vercel 배포

- 프로젝트에 `data/corp.xml` 을 포함하거나, 빌드 시점에 동일 경로로 파일이 있어야 합니다.
- Vercel **Environment Variables**에 `OPENDART_CRTFC_KEY`, `GEMINI_API_KEY`, (선택) `GEMINI_MODEL` 을 등록합니다.
- OpenDART가 **허용 IP(오류 012)** 를 요구하는 키인 경우, Vercel 서버리스 출구 IP와 정책이 맞는지 FSS 안내를 확인하세요.

## 라이선스 / 데이터

공시 데이터의 이용 조건은 금융감독원·OpenDART 안내를 따릅니다.
