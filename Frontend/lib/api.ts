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
  is_read: boolean | null
  created_at: string | null
}

export type LoginRequest = {
  email: string
  name?: string
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

export type PlanFeatures = {
  monitoring: boolean
  country_risk: boolean
  price_alerts: boolean
  recommendations: boolean
  ai_reports: boolean
  reweight: boolean
  api_access: boolean
}

export type SubscriptionPlan = {
  key: string
  label: string
  price_krw: number
  target: string
  max_items: number | null
  custom_quote: boolean
  highlights: string[]
  features: PlanFeatures
}

export type SubscriptionState = {
  plans: SubscriptionPlan[]
  current_plan: string
  label: string
  usage: {
    items: number
    items_limit: number | null
  }
  features: PlanFeatures
}

export type SubscribeResult = Omit<SubscriptionState, "plans"> & { ok: boolean }

export type ReweightResult = {
  hs_code: string
  countries: number
  uses_llm?: boolean
  weights?: Record<string, number>
}

export type ChatHistoryMessage = {
  role: "user" | "assistant"
  content: string
}

export type ChatRequest = {
  message: string
  query_id?: number
  history?: ChatHistoryMessage[]
}

export type ChatResponse = {
  answer: string
  followups: string[]
  source: "gemini" | "fallback"
}

export type BoardStatus = "candidate" | "reviewing" | "selected" | "rejected"
export type BoardItemKind = "country" | "company" | "note"

export type BoardCreate = {
  title: string
  description?: string
  query_id?: number
}

export type BoardUpdate = {
  title?: string
  description?: string
}

export type BoardOut = {
  board_id: number
  user_id: number | null
  query_id: number | null
  title: string
  description: string | null
  created_at: string | null
  updated_at: string | null
}

export type BoardItemCreate = {
  kind: BoardItemKind
  title: string
  ref_code?: string
  memo?: string
  status?: BoardStatus
}

export type BoardItemUpdate = {
  title?: string
  memo?: string
  status?: BoardStatus
  position?: number
}

export type BoardItemOut = {
  item_id: number
  board_id: number
  kind: BoardItemKind
  ref_code: string | null
  title: string
  memo: string | null
  status: BoardStatus | null
  position: number | null
  created_at: string | null
}

export type BoardDetailOut = BoardOut & {
  items: BoardItemOut[]
}

export type TokenResponse = {
  access_token: string
  token_type: string
  user: UserOut
}

export class ApiError extends Error {
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(detail || `API ${status}`)
    this.name = "ApiError"
    this.status = status
    this.detail = detail
  }
}

export function isUpgradeRequiredError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 402
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
    const responseText = await res.text()
    let detail = responseText
    try {
      const body = JSON.parse(responseText) as { detail?: unknown }
      if (typeof body.detail === "string") detail = body.detail
    } catch {
      // JSON이 아닌 오류 응답은 원문을 사용자에게 전달한다.
    }
    throw new ApiError(res.status, detail || `요청을 처리하지 못했습니다. (${res.status})`)
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
  googleLogin: async (idToken: string) => {
    const response = await http<TokenResponse>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ id_token: idToken }),
    })
    window.localStorage.setItem(ACCESS_TOKEN_KEY, response.access_token)
    return response
  },
  getMe: () => http<UserOut>("/auth/me"),
  getSubscription: () => http<SubscriptionState>("/subscription"),
  subscribe: (plan: string) =>
    http<SubscribeResult>("/subscription", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  // F-01 품목 입력
  createQuery: (body: QueryCreate) =>
    http<QueryOut>("/queries", { method: "POST", body: JSON.stringify(body) }),
  getQueries: () => http<QueryOut[]>("/queries"),
  getQuery: (queryId: number) => http<QueryOut>(`/queries/${queryId}`),
  deleteQuery: (queryId: number) =>
    http<void>(`/queries/${queryId}`, { method: "DELETE" }),
  // F-06 국가 추천 / F-07·08 기업 추천
  getCountryRecos: (queryId: number) =>
    http<CountryReco[]>(`/queries/${queryId}/countries`),
  getSupplierRecos: (queryId: number) =>
    http<SupplierReco[]>(`/queries/${queryId}/suppliers`),
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
  reweightItem: (hsCode: string) =>
    http<ReweightResult>(`/items/${encodeURIComponent(hsCode)}/reweight`, { method: "POST" }),
  chat: (body: ChatRequest) =>
    http<ChatResponse>("/chat", { method: "POST", body: JSON.stringify(body) }),
  getBoards: () => http<BoardOut[]>("/boards"),
  createBoard: (body: BoardCreate) =>
    http<BoardOut>("/boards", { method: "POST", body: JSON.stringify(body) }),
  getBoard: (boardId: number) => http<BoardDetailOut>(`/boards/${boardId}`),
  updateBoard: (boardId: number, body: BoardUpdate) =>
    http<BoardOut>(`/boards/${boardId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteBoard: (boardId: number) =>
    http<void>(`/boards/${boardId}`, { method: "DELETE" }),
  addBoardItem: (boardId: number, body: BoardItemCreate) =>
    http<BoardItemOut>(`/boards/${boardId}/items`, { method: "POST", body: JSON.stringify(body) }),
  updateBoardItem: (boardId: number, itemId: number, body: BoardItemUpdate) =>
    http<BoardItemOut>(`/boards/${boardId}/items/${itemId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteBoardItem: (boardId: number, itemId: number) =>
    http<void>(`/boards/${boardId}/items/${itemId}`, { method: "DELETE" }),
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
}
