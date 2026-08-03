// 백엔드(FastAPI) 호출용 API 클라이언트.
// 모든 화면은 fetch를 직접 쓰지 않고 여기 api.* 를 통해 백엔드와 통신한다.

const BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1"

const ACCESS_TOKEN_KEY = "access_token"

// ── 백엔드 응답 타입 (backend/app/schemas 와 1:1) ──
export type QueryCreate = {
  item_name?: string
  hs_code?: string
  required_qty?: number
  qty_unit?: string
  target_price?: number
  lead_time_days?: number
  importer_code?: string
  origin_country?: string   // 등록한 관련 공급국(콤마구분 국가명)
  trading_country?: string  // 그중 '현재 거래 중'인 국가(콤마구분, 부분집합)
  trading_company_id?: number | null  // (구) 단일 거래 기업
  registered_company_ids?: string | null  // 등록한 기업 id(콤마구분)
  trading_company_ids?: string | null     // 그중 거래중 기업 id(콤마구분)
}

export type QueryOut = QueryCreate & {
  query_id: number
  user_id: number | null
  created_at: string | null
}

export type CountryReco = {
  reco_id: number
  country_code: string
  rank: number
  sgri_score: string | null
  fit_score: string | null
  est_unit_price: string | null
  tariff_percent: string | null
  est_lead_days: number | null
  rationale: string | null
}

export type FeedbackCreate = {
  reco_type: "country" | "supplier"
  reco_id: number
  rating: 1 | -1
  comment?: string
}

export type FeedbackOut = FeedbackCreate & {
  feedback_id: number
  user_id: number | null
  created_at: string | null
}

export type Company = {
  company_id: number
  name: string
  country_code: string | null
  certifications: string[] | null
  annual_capacity: string | null
  capacity_unit: string | null
  status: string | null
  data_source: string | null   // null/실데이터 vs 'ai:gemini'(AI 추정)
  // 조달 비교 지표
  unit_price: string | null
  lead_time_days: number | null
  on_time_delivery_rate: string | null
  defect_rate_pct: string | null
}

export type SupplierReco = {
  rank: number
  fit_score: string | null
  est_unit_price: string | null
  est_lead_days: number | null
  delivery_feasibility: string | null
  rationale: string | null
  company: Company
}

export type CompanyDetail = {
  company_id: number
  name: string
  name_en: string | null
  country_code: string | null
  company_type: string | null
  website: string | null
  hs_codes: string[] | null
  certifications: string[] | null
  annual_capacity: string | null
  capacity_unit: string | null
  status: string | null
  unit_price: string | null
  available_quantity: string | null
  lead_time_days: number | null
  on_time_delivery_rate: string | null
  defect_rate_pct: string | null
}

export type ReportSection = { id: string; title: string; body: string }

export type ReportOut = {
  report_id: number
  query_id: number | null
  title: string | null
  status: string | null
  sections: ReportSection[] | Record<string, string> | null
  summary: string | null
  pdf_url: string | null
  created_at: string | null
}

export type ReportCreate = {
  query_id?: number
  title?: string
}

export type ReportUpdate = {
  title?: string
  status?: string
  sections?: ReportSection[] | Record<string, string>
  summary?: string
}

export type AnalyzeSummary = {
  query_id: number
  sgri_score?: number
  level?: string
  report_id?: number
  supplier_count?: number
  error?: string
}

export type AnalyzeJob = {
  job_id: string
  status: "pending" | "done" | "error"
  result?: AnalyzeSummary
  error?: string
}

export type BuildItemSgriResult = {
  hs_code: string
  comtrade_years_ingested: number
  countries: number
  uses_llm: boolean | null
  weights: Record<string, number> | null
  error?: string
}

export type BuildItemSgriJob = {
  job_id: string
  status: "pending" | "done" | "error"
  result?: BuildItemSgriResult
  error?: string
}

export type RiskOut = {
  country_code: string
  hs_code: string | null
  as_of_date: string
  score_s: string | null
  score_c: string | null
  score_v: string | null
  score_l: string | null
  score_p: string | null
  score_e: string | null
  sgri_score: string | null
  level: string
}

export type AlertOut = {
  alert_id: number
  query_id: number | null
  country_code: string | null
  hs_code: string | null
  alert_type: string | null
  severity: string | null
  title: string | null
  message: string | null
  source_url: string | null
  is_read: boolean | null
  created_at: string | null
}

export type LoginRequest = {
  email: string
  name?: string
  password?: string
}

export type RegisterRequest = {
  email: string
  password: string
  name?: string
}

export type HsCodeOut = {
  hs_code: string
  name_ko: string | null
  name_en: string | null
}

export type UserOut = {
  user_id: number
  email: string
  name: string | null
  picture_url: string | null
  company_id: number | null
  role: string | null
  plan: string | null
}

export type TrendBrief = {
  summary: string
  highlights?: string[]
  watch_items?: string[]
  source: string
  stats: {
    items: { name: string; hs: string | null; sgri: number; level: string | null }[]
    alert_by_type: Record<string, number>
    alert_by_severity: { high: number; medium: number; low: number }
    alert_total: number
    avg_sgri: number | null
    max_sgri: number | null
    high_count: number
    item_count: number
  }
}

export type TokenResponse = {
  access_token: string
  token_type: string
  user: UserOut
}

// 구독 요금제 (backend/app/services/plans.py 와 1:1)
export type PlanCatalog = {
  key: string
  label: string
  price_krw: number
  target: string
  max_items: number | null
  custom_quote?: boolean
  highlights: string[]
  features: Record<string, boolean>
}

export type SubscriptionState = {
  plans: PlanCatalog[]
  current_plan: string
  label: string
  usage: { items: number; items_limit: number | null }
  features: Record<string, boolean>
}

// AI 챗봇 (backend/app/api/v1/chat.py)
export type ChatMessage = { role: "user" | "assistant"; content: string }
export type ChatResponse = { answer: string; followups: string[]; source: string }

// 검토 보드/카드 (backend/app/api/v1/boards.py) — 칸반식 조달 검토 워크스페이스
export type BoardCard = {
  item_id: number
  board_id: number
  kind: string              // country | company | note
  ref_code: string | null
  title: string
  memo: string | null
  status: string | null     // candidate | reviewing | selected | rejected
  position: number | null
  created_at: string | null
}
export type Board = {
  board_id: number
  user_id: number | null
  query_id: number | null
  title: string
  description: string | null
  created_at: string | null
  updated_at: string | null
}
export type BoardDetail = Board & { items: BoardCard[] }
export type BoardCardCreate = { kind: string; title: string; ref_code?: string; memo?: string; status?: string }
export type BoardCardUpdate = { title?: string; memo?: string; status?: string; position?: number }

// 벤치마크 (backend/app/api/v1/benchmark.py)
export type BenchmarkIndicator = { key: string; label: string; item_avg: number; all_avg: number; delta: number; verdict: string }
export type ItemBenchmark = {
  hs_code: string
  error?: string
  basis?: string
  item_avg_sgri?: number
  all_items_avg_sgri?: number
  sgri_delta?: number
  sgri_verdict?: string
  indicators?: BenchmarkIndicator[]
  country?: { country_code: string; sgri: number; candidate_countries: number; risk_percentile: number; vs_item_avg: number; summary: string }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem(ACCESS_TOKEN_KEY)
    if (token) headers.set("Authorization", `Bearer ${token}`)
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`API ${res.status}: ${detail}`)
  }
  // DELETE처럼 성공 응답에 본문이 없는 경우 JSON 파싱을 시도하지 않는다.
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  login: async (body: LoginRequest) => {
    const response = await http<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    })
    window.localStorage.setItem(ACCESS_TOKEN_KEY, response.access_token)
    return response
  },
  // 구글 로그인 — GIS credential(ID 토큰)을 검증받고 우리 JWT 저장
  // 이메일+비밀번호 회원가입 → 토큰 저장
  register: async (body: RegisterRequest) => {
    const response = await http<TokenResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    })
    window.localStorage.setItem(ACCESS_TOKEN_KEY, response.access_token)
    return response
  },
  // HS 코드 자동완성 검색
  searchHsCodes: (q: string) =>
    http<HsCodeOut[]>(`/hs-codes?q=${encodeURIComponent(q)}`),
  googleLogin: async (idToken: string) => {
    const response = await http<TokenResponse>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ id_token: idToken }),
    })
    window.localStorage.setItem(ACCESS_TOKEN_KEY, response.access_token)
    return response
  },
  getMe: () => http<UserOut>("/auth/me"),
  // 최신 동향 분석 (AI 요약 + 차트용 집계)
  getTrendBrief: () => http<TrendBrief>("/trends/brief"),
  // 프로필 편집(이름/사진) · 비밀번호 변경
  updateMe: (body: { name?: string; picture_url?: string | null }) =>
    http<UserOut>("/auth/me", { method: "PATCH", body: JSON.stringify(body) }),
  changePassword: (body: { current_password?: string; new_password: string }) =>
    http<void>("/auth/change-password", { method: "POST", body: JSON.stringify(body) }),
  // F-01 품목 입력
  createQuery: (body: QueryCreate) =>
    http<QueryOut>("/queries", { method: "POST", body: JSON.stringify(body) }),
  getQueries: () => http<QueryOut[]>("/queries"),
  getQuery: (queryId: number) => http<QueryOut>(`/queries/${queryId}`),
  updateQuery: (queryId: number, body: { origin_country?: string; trading_country?: string; trading_company_id?: number | null; registered_company_ids?: string; trading_company_ids?: string }) =>
    http<QueryOut>(`/queries/${queryId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteQuery: (queryId: number) =>
    http<void>(`/queries/${queryId}`, { method: "DELETE" }),
  // F-06 국가 추천 / F-07·08 기업 추천
  getCountryRecos: (queryId: number) =>
    http<CountryReco[]>(`/queries/${queryId}/countries`),
  getSupplierRecos: (queryId: number) =>
    http<SupplierReco[]>(`/queries/${queryId}/suppliers`),
  // 지정 국가에 대해 AI가 기업 후보를 생성해 추천에 추가 → 갱신된 추천 목록 반환
  generateAiSuppliers: (queryId: number, countryCode: string) =>
    http<SupplierReco[]>(`/queries/${queryId}/suppliers/ai`, { method: "POST", body: JSON.stringify({ country_code: countryCode }) }),
  sendFeedback: (body: FeedbackCreate) =>
    http<FeedbackOut>("/feedback", { method: "POST", body: JSON.stringify(body) }),
  // 공급사 상세 (기업 공개 정보)
  getCompany: (companyId: number) =>
    http<CompanyDetail>(`/companies/${companyId}`),
  // F-09 AI 심층분석 시작 — 202 + job_id 반환(비동기)
  analyzeQuery: (queryId: number) =>
    http<AnalyzeJob>(`/queries/${queryId}/analyze`, { method: "POST" }),
  // 분석 작업 상태 폴링
  getAnalyzeJob: (jobId: string) =>
    http<AnalyzeJob>(`/queries/analyze/jobs/${jobId}`),
  // 신규 HS 코드의 Comtrade 수집 및 SGRI 계산 시작
  buildItemSgri: (hsCode: string) =>
    http<BuildItemSgriJob>(`/items/${encodeURIComponent(hsCode)}/build-sgri`, { method: "POST" }),
  // 신규 품목 SGRI 작업 상태 폴링
  getBuildJob: (jobId: string) =>
    http<BuildItemSgriJob>(`/items/build/jobs/${encodeURIComponent(jobId)}`),
  // F-10 보고서 조회
  createReport: (body: ReportCreate) =>
    http<ReportOut>("/reports", { method: "POST", body: JSON.stringify(body) }),
  getReports: (queryId?: number) =>
    http<ReportOut[]>(`/reports${queryId ? `?query_id=${queryId}` : ""}`),
  getReport: (reportId: number) => http<ReportOut>(`/reports/${reportId}`),
  updateReport: (reportId: number, body: ReportUpdate) =>
    http<ReportOut>(`/reports/${reportId}`, { method: "PATCH", body: JSON.stringify(body) }),
  // F-05 국가별 SGRI (대시보드 고위험 품목)
  getRisks: (hsCode?: string) =>
    http<RiskOut[]>(`/risks${hsCode ? `?hs_code=${hsCode}` : ""}`),
  // F-10 알림
  getAlerts: (unreadOnly = false) =>
    http<AlertOut[]>(`/alerts${unreadOnly ? "?unread_only=true" : ""}`),
  markAlertRead: (alertId: number) =>
    http<AlertOut>(`/alerts/${alertId}/read`, { method: "PATCH" }),
  // 구독 요금제 — 카탈로그 + 현재 플랜/사용량 조회, 플랜 변경(데모 mock 결제)
  getSubscription: () => http<SubscriptionState>("/subscription"),
  subscribe: (plan: string) =>
    http<Omit<SubscriptionState, "plans"> & { ok: boolean }>("/subscription", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  // AI 챗봇 — 사용자 공급망 데이터 기반 질의응답
  chat: (message: string, opts?: { query_id?: number; history?: ChatMessage[] }) =>
    http<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify({ message, query_id: opts?.query_id, history: opts?.history }),
    }),
  // 검토 보드 (칸반식 조달 검토)
  getBoards: () => http<Board[]>("/boards"),
  createBoard: (body: { title: string; description?: string; query_id?: number }) =>
    http<Board>("/boards", { method: "POST", body: JSON.stringify(body) }),
  getBoard: (boardId: number) => http<BoardDetail>(`/boards/${boardId}`),
  updateBoard: (boardId: number, body: { title?: string; description?: string }) =>
    http<Board>(`/boards/${boardId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteBoard: (boardId: number) => http<void>(`/boards/${boardId}`, { method: "DELETE" }),
  addBoardCard: (boardId: number, body: BoardCardCreate) =>
    http<BoardCard>(`/boards/${boardId}/items`, { method: "POST", body: JSON.stringify(body) }),
  updateBoardCard: (boardId: number, itemId: number, body: BoardCardUpdate) =>
    http<BoardCard>(`/boards/${boardId}/items/${itemId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteBoardCard: (boardId: number, itemId: number) =>
    http<void>(`/boards/${boardId}/items/${itemId}`, { method: "DELETE" }),
  // 벤치마크 (품목/국가 상대 위치)
  getItemBenchmark: (hsCode: string, countryCode?: string) =>
    http<ItemBenchmark>(`/benchmark/item/${encodeURIComponent(hsCode)}${countryCode ? `?country_code=${countryCode}` : ""}`),
}
