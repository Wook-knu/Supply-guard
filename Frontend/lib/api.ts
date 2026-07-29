// 백엔드(FastAPI) 호출용 API 클라이언트.
// 모든 화면은 fetch를 직접 쓰지 않고 여기 api.* 를 통해 백엔드와 통신한다.

const BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1"

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
  country_code: string
  rank: number
  sgri_score: string | null
  fit_score: string | null
  est_unit_price: string | null
  tariff_percent: string | null
  est_lead_days: number | null
  rationale: string | null
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

export type ReportSection = { id: string; title: string; body: string }

export type ReportOut = {
  report_id: number
  query_id: number | null
  title: string | null
  status: string | null
  sections: ReportSection[] | null
  summary: string | null
  created_at: string | null
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

export type RiskOut = {
  country_code: string
  hs_code: string | null
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

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`API ${res.status}: ${detail}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  // F-01 품목 입력
  createQuery: (body: QueryCreate) =>
    http<QueryOut>("/queries", { method: "POST", body: JSON.stringify(body) }),
  getQuery: (queryId: number) => http<QueryOut>(`/queries/${queryId}`),
  // F-06 국가 추천 / F-07·08 기업 추천
  getCountryRecos: (queryId: number) =>
    http<CountryReco[]>(`/queries/${queryId}/countries`),
  getSupplierRecos: (queryId: number) =>
    http<SupplierReco[]>(`/queries/${queryId}/suppliers`),
  // F-09 AI 심층분석 시작 — 202 + job_id 반환(비동기)
  analyzeQuery: (queryId: number) =>
    http<AnalyzeJob>(`/queries/${queryId}/analyze`, { method: "POST" }),
  // 분석 작업 상태 폴링
  getAnalyzeJob: (jobId: string) =>
    http<AnalyzeJob>(`/queries/analyze/jobs/${jobId}`),
  // F-10 보고서 조회
  getReport: (reportId: number) => http<ReportOut>(`/reports/${reportId}`),
  // F-05 국가별 SGRI (대시보드 고위험 품목)
  getRisks: (hsCode?: string) =>
    http<RiskOut[]>(`/risks${hsCode ? `?hs_code=${hsCode}` : ""}`),
  // F-10 알림
  getAlerts: (unreadOnly = false) =>
    http<AlertOut[]>(`/alerts${unreadOnly ? "?unread_only=true" : ""}`),
  markAlertRead: (alertId: number) =>
    http<AlertOut>(`/alerts/${alertId}/read`, { method: "PATCH" }),
}
