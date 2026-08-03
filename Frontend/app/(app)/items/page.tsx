"use client"

// 사용자가 등록한 모니터링 품목과 각 품목의 최신 최고 SGRI를 관리합니다.

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  BarChart3,
  Bell,
  CircleAlert,
  FileText,
  Loader2,
  PackageOpen,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, type QueryOut, type RiskOut } from "@/lib/api"
import { COUNTRY_OPTIONS, getCountryName } from "@/lib/countries"

type PageStatus = "loading" | "ready" | "error"
type RiskLevel = "high" | "medium" | "low"
type OriginStatus = "trading" | "registered" | "fallback"
type RiskSummary = { score: number; level: RiskLevel; countryCode: string; status: OriginStatus }

// 콤마구분 국가명/코드 → ISO 코드 목록.
function toCodes(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean)
    .map((n) => COUNTRY_OPTIONS.find((c) => c.name === n || c.code === n.toUpperCase())?.code)
    .filter((c): c is string => Boolean(c))
}

function latestRiskRows(rows: RiskOut[]) {
  const latest = new Map<string, RiskOut>()
  rows.forEach((row) => {
    const key = `${row.hs_code ?? ""}:${row.country_code}`
    const current = latest.get(key)
    if (!current || row.as_of_date > current.as_of_date) latest.set(key, row)
  })
  return [...latest.values()]
}

function riskLevel(row: RiskOut, score: number): RiskLevel {
  const level = row.level.trim().toLocaleLowerCase("ko")
  if (level.includes("높") || level === "high") return "high"
  if (level.includes("중") || level === "medium") return "medium"
  if (level.includes("낮") || level.includes("안정") || level === "low") return "low"
  return score >= 50 ? "high" : score >= 25 ? "medium" : "low"
}

// 등록 국가(거래중 우선) 기준으로 대표 위험도를 고른다. 최고SGRI 자동선택은 안 함(구 데이터 안전망만).
function summarizeRisk(rows: RiskOut[], originCodes: string[] = [], tradingCodes: string[] = []): RiskSummary | null {
  const latest = latestRiskRows(rows)
  const pickHighest = (pool: RiskOut[]) => pool.reduce<RiskOut | null>((current, row) => {
    if (!current) return row
    return Number(row.sgri_score ?? 0) > Number(current.sgri_score ?? 0) ? row : current
  }, null)
  const inSet = (r: RiskOut, set: string[]) => set.includes((r.country_code ?? "").toUpperCase())

  let ref: RiskOut | null = null
  let status: OriginStatus = "fallback"
  if (tradingCodes.length) { ref = pickHighest(latest.filter((r) => inSet(r, tradingCodes))); if (ref) status = "trading" }
  if (!ref && originCodes.length) { ref = pickHighest(latest.filter((r) => inSet(r, originCodes))); if (ref) status = "registered" }
  if (!ref) ref = pickHighest(latest)  // 구 데이터(국가 미등록) 안전망

  if (!ref) return null
  const score = Math.round(Number(ref.sgri_score ?? 0))
  return { score, level: riskLevel(ref, score), countryCode: ref.country_code ?? "", status }
}

function formatCreatedAt(value: string | null) {
  if (!value) return "등록일 없음"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "등록일 없음"
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
}

function RiskBadge({ summary }: { summary: RiskSummary }) {
  const styles: Record<RiskLevel, string> = {
    high: "border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-50",
    medium: "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-50",
    low: "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  }
  const labels: Record<RiskLevel, string> = { high: "고위험", medium: "주의", low: "안정" }

  return (
    <div className="flex items-center gap-2">
      <Badge className={`${styles[summary.level]} border font-medium`}>
        {labels[summary.level]}
      </Badge>
      <span className="text-sm font-semibold text-slate-700">{summary.score}</span>
      <span className="text-xs text-slate-400">/ 100</span>
    </div>
  )
}

export default function ItemsPage() {
  const [items, setItems] = useState<QueryOut[]>([])
  const [risksByHsCode, setRisksByHsCode] = useState<Record<string, RiskOut[]>>({})
  const [failedRiskHsCodes, setFailedRiskHsCodes] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<PageStatus>("loading")
  const [reloadKey, setReloadKey] = useState(0)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteErrorId, setDeleteErrorId] = useState<number | null>(null)
  const [successMessage, setSuccessMessage] = useState("")

  useEffect(() => {
    let isActive = true
    setStatus("loading")
    setSuccessMessage("")

    api.getQueries()
      .then(async (queryRows) => {
        if (!isActive) return
        const hsCodes = [...new Set(queryRows.map((row) => row.hs_code).filter((code): code is string => Boolean(code)))]
        const results = await Promise.allSettled(hsCodes.map((hsCode) => api.getRisks(hsCode)))
        if (!isActive) return

        const raw: Record<string, RiskOut[]> = {}
        const failedCodes = new Set<string>()
        results.forEach((result, index) => {
          const hsCode = hsCodes[index]
          if (result.status === "fulfilled") raw[hsCode] = result.value
          else failedCodes.add(hsCode)
        })

        setItems(queryRows)
        setRisksByHsCode(raw)
        setFailedRiskHsCodes(failedCodes)
        setStatus("ready")
      })
      .catch(() => {
        if (!isActive) return
        setItems([])
        setRisksByHsCode({})
        setFailedRiskHsCodes(new Set())
        setStatus("error")
      })

    return () => { isActive = false }
  }, [reloadKey])

  const sortedItems = useMemo(() => [...items].sort((a, b) => {
    if (!a.created_at) return 1
    if (!b.created_at) return -1
    return b.created_at.localeCompare(a.created_at)
  }), [items])

  const deleteItem = async (item: QueryOut) => {
    setDeletingId(item.query_id)
    setDeleteErrorId(null)
    setSuccessMessage("")
    try {
      await api.deleteQuery(item.query_id)
      setItems((current) => current.filter((row) => row.query_id !== item.query_id))
      setPendingDeleteId(null)
      setSuccessMessage(`${item.item_name?.trim() || `HS ${item.hs_code ?? "코드 없음"}`} 품목을 삭제했습니다.`)
    } catch {
      setDeleteErrorId(item.query_id)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm">
            <ShieldAlert className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold tracking-tight">SupplyGuard</span>
        </Link>
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="relative text-slate-600">
            <Link href="/alerts" aria-label="알림 보기"><Bell className="h-4 w-4" /></Link>
          </Button>
          <Avatar className="h-8 w-8 border border-slate-200">
            <AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SG</AvatarFallback>
          </Avatar>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600">
          <ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기
        </Link>

        <section className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600">
              <PackageOpen className="h-4 w-4" /> 모니터링 품목 관리
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">내 품목</h1>
            <p className="mt-2 text-sm text-slate-500">등록한 품목의 공급망 위험도를 확인하고 분석·추천·보고서로 이동할 수 있습니다.</p>
          </div>
          <Button asChild className="w-fit bg-blue-600 shadow-sm hover:bg-blue-700">
            <Link href="/items/new"><Plus className="mr-2 h-4 w-4" />품목 추가</Link>
          </Button>
        </section>

        {successMessage && (
          <div role="status" className="mt-6 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        )}

        {status === "loading" ? (
          <Card className="mt-7 border-slate-200 shadow-sm">
            <CardContent className="flex min-h-72 flex-col items-center justify-center text-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="mt-4 text-sm font-medium text-slate-700">품목과 위험도를 불러오는 중입니다.</p>
              <p className="mt-1 text-xs text-slate-500">등록한 품목 수에 따라 잠시 걸릴 수 있습니다.</p>
            </CardContent>
          </Card>
        ) : status === "error" ? (
          <Card className="mt-7 border-rose-100 shadow-sm">
            <CardContent className="flex min-h-72 flex-col items-center justify-center text-center">
              <CircleAlert className="h-9 w-9 text-rose-500" />
              <p className="mt-4 font-semibold text-slate-800">품목 목록을 불러오지 못했습니다.</p>
              <p className="mt-1 text-sm text-slate-500">네트워크 상태를 확인한 뒤 다시 시도해 주세요.</p>
              <Button type="button" variant="outline" onClick={() => setReloadKey((current) => current + 1)} className="mt-5 border-slate-200">
                <RefreshCw className="mr-2 h-4 w-4" />다시 시도
              </Button>
            </CardContent>
          </Card>
        ) : sortedItems.length === 0 ? (
          <Card className="mt-7 border-dashed border-slate-300 bg-white shadow-sm">
            <CardContent className="flex min-h-80 flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <PackageOpen className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-lg font-semibold">아직 등록한 품목이 없습니다</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">품목을 등록하면 국가별 공급망 위험도와 대체 공급처 추천을 한곳에서 관리할 수 있습니다.</p>
              <Button asChild className="mt-6 bg-blue-600 hover:bg-blue-700">
                <Link href="/items/new"><Plus className="mr-2 h-4 w-4" />첫 품목 등록하기</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="mt-7 border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <CardTitle className="text-base">모니터링 품목</CardTitle>
                  <CardDescription className="mt-1">총 {sortedItems.length}개 품목 · 등록한 거래국 기준 SGRI(미지정 시 최고 위험국)</CardDescription>
                </div>
                {failedRiskHsCodes.size > 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setReloadKey((current) => current + 1)} className="w-fit border-amber-200 text-amber-700">
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />위험도 다시 불러오기
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {failedRiskHsCodes.size > 0 && (
                <div role="alert" className="mx-6 mt-5 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> 일부 품목의 위험도를 불러오지 못했습니다. 품목 정보와 사용 가능한 이동 기능은 그대로 이용할 수 있습니다.
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="min-w-48 pl-6">품목</TableHead>
                    <TableHead className="min-w-32">HS 코드</TableHead>
                    <TableHead className="min-w-40">국가</TableHead>
                    <TableHead className="min-w-48">SGRI</TableHead>
                    <TableHead className="min-w-36">등록일</TableHead>
                    <TableHead className="min-w-[31rem] pr-6 text-right">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedItems.map((item) => {
                    const hsCode = item.hs_code?.trim()
                    const rawRows = hsCode ? risksByHsCode[hsCode] : undefined
                    const riskSummary = rawRows ? summarizeRisk(rawRows, toCodes(item.origin_country), toCodes(item.trading_country)) : null
                    const riskFailed = Boolean(hsCode && failedRiskHsCodes.has(hsCode))
                    const isDeleting = deletingId === item.query_id
                    const isConfirming = pendingDeleteId === item.query_id

                    return (
                      <TableRow key={item.query_id} className="hover:bg-slate-50/70">
                        <TableCell className="pl-6">
                          <p className="font-medium text-slate-800">{item.item_name?.trim() || (hsCode ? `HS ${hsCode}` : "품목명 없음")}</p>
                        </TableCell>
                        <TableCell><span className="font-mono text-sm text-slate-600">{hsCode || "HS 코드 없음"}</span></TableCell>
                        <TableCell>
                          {riskSummary?.countryCode ? (
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-slate-700">{getCountryName(riskSummary.countryCode) || riskSummary.countryCode}</span>
                              <span className={`text-xs ${riskSummary.status === "trading" ? "text-blue-600" : riskSummary.status === "registered" ? "text-slate-500" : "text-slate-400"}`}>{riskSummary.status === "trading" ? "현재 거래국" : riskSummary.status === "registered" ? "등록 국가" : "최고 위험국"}</span>
                            </div>
                          ) : <span className="text-sm text-slate-400">—</span>}
                        </TableCell>
                        <TableCell>
                          {riskFailed ? <span className="text-sm text-rose-600">불러오기 실패</span>
                            : riskSummary ? <RiskBadge summary={riskSummary} />
                              : <span className="text-sm text-slate-400">위험 데이터 없음</span>}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">{formatCreatedAt(item.created_at)}</TableCell>
                        <TableCell className="pr-6">
                          <div className="flex min-w-max items-center justify-end gap-1.5">
                            {hsCode ? (
                              <Button asChild variant="outline" size="sm" className="h-8 border-slate-200 bg-white text-xs">
                                <Link href={`/risks/${hsCode}`}><BarChart3 className="mr-1 h-3.5 w-3.5" />리스크 상세</Link>
                              </Button>
                            ) : (
                              <Button type="button" variant="outline" size="sm" disabled className="h-8 text-xs">리스크 상세</Button>
                            )}
                            <Button asChild variant="outline" size="sm" className="h-8 border-slate-200 bg-white text-xs">
                              <Link href={`/recommendations?query_id=${item.query_id}`}><Sparkles className="mr-1 h-3.5 w-3.5" />추천 보기</Link>
                            </Button>
                            <Button asChild variant="outline" size="sm" className="h-8 border-slate-200 bg-white text-xs">
                              <Link href={`/reports/new?query_id=${item.query_id}`}><FileText className="mr-1 h-3.5 w-3.5" />보고서</Link>
                            </Button>
                            {isConfirming ? (
                              <div className="flex items-center gap-1.5 rounded-md border border-rose-100 bg-rose-50 p-1">
                                <span className="px-1 text-xs font-medium text-rose-700">삭제할까요?</span>
                                <Button type="button" variant="ghost" size="sm" disabled={isDeleting} onClick={() => setPendingDeleteId(null)} className="h-7 px-2 text-xs">취소</Button>
                                <Button type="button" size="sm" disabled={isDeleting} onClick={() => void deleteItem(item)} className="h-7 bg-rose-600 px-2 text-xs hover:bg-rose-700">
                                  {isDeleting ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />삭제 중</> : "삭제"}
                                </Button>
                              </div>
                            ) : (
                              <Button type="button" variant="ghost" size="sm" onClick={() => { setPendingDeleteId(item.query_id); setDeleteErrorId(null) }} className="h-8 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                                <Trash2 className="mr-1 h-3.5 w-3.5" />삭제
                              </Button>
                            )}
                          </div>
                          {deleteErrorId === item.query_id && <p role="alert" className="mt-2 text-right text-xs text-rose-600">삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
