"use client"

// 서비스의 핵심 현황을 위험도·알림·보고서 API 기반으로 요약합니다.

import { useEffect, useMemo, useRef, useState } from "react"
import { api, type AlertOut, type CountryReco, type QueryOut, type ReportOut, type RiskOut, type SupplierReco } from "@/lib/api"
import { COUNTRY_OPTIONS, getCountryName } from "@/lib/countries"
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  Bell,
  Bot,
  Box,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  ExternalLink,
  FileText,
  Globe2,
  Home,
  Landmark,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Link from "next/link"
import dynamic from "next/dynamic"
import type { RiskPoint } from "@/components/world-risk-map"

const WorldRiskMap = dynamic(() => import("@/components/world-risk-map"), {
  ssr: false,
  loading: () => <div className="grid h-48 place-items-center text-xs text-slate-400">지도 로딩…</div>,
})
const mapRiskColor = (sgri: number | null) => (sgri == null ? "#94a3b8" : sgri >= 60 ? "#ef4444" : sgri >= 35 ? "#f59e0b" : "#10b981")

type RiskRow = { item: string; hs: string; code: string; country: string; score: number; factor: string; level: "high" | "medium" | "low"; change?: string }
type SearchResult = {
  key: string
  hsCode: string
  itemName: string
  countryCode?: string
  countryName?: string
  sgriScore?: number
}

// 알림 severity → 화면용 한글 라벨 (최신 동향 카드에서 사용)
function severityLabel(severity: string | null): "고위험" | "주의" | "안정" {
  if (severity === "high" || severity === "높음") return "고위험"
  if (severity === "low" || severity === "안정") return "안정"
  return "주의"
}

function latestRiskRows(rows: RiskOut[]) {
  const latest = new Map<string, RiskOut>()
  rows.forEach((row) => {
    const key = `${row.hs_code ?? ""}:${row.country_code}`
    const current = latest.get(key)
    if (!current || row.as_of_date > current.as_of_date) latest.set(key, row)
  })
  return [...latest.values()].sort((a, b) => Number(b.sgri_score ?? 0) - Number(a.sgri_score ?? 0))
}

function RiskBadge({ level }: { level: "high" | "medium" | "low" }) {
  // 백엔드에서 받은 위험 단계 값을 사용자용 색상과 한글 라벨로 변환합니다.
  const styles = {
    high: "bg-rose-50 text-rose-700 border-rose-100",
    medium: "bg-amber-50 text-amber-700 border-amber-100",
    low: "bg-emerald-50 text-emerald-700 border-emerald-100",
  }
  const labels = { high: "고위험", medium: "주의", low: "안정" }
  return <Badge className={`${styles[level]} border font-medium hover:${styles[level]}`}>{labels[level]}</Badge>
}

export default function Dashboard() {
  // 기간 선택과 표 펼치기는 서버 데이터와 무관한 화면 표시 상태입니다.
  const [period, setPeriod] = useState("최근 7일")
  const [showAllRisks, setShowAllRisks] = useState(false)
  const [riskHistory, setRiskHistory] = useState<RiskOut[]>([])
  const [queries, setQueries] = useState<QueryOut[]>([])
  const [selectedHsCode, setSelectedHsCode] = useState("")
  const [alerts, setAlerts] = useState<AlertOut[]>([])
  const [countryRecos, setCountryRecos] = useState<CountryReco[]>([])
  const [supplierRecos, setSupplierRecos] = useState<SupplierReco[]>([])
  // 등록/거래중으로 지정한 기업 목록(품목 가로질러 평탄화) — 기업 적합도 카드용
  const [regCompanies, setRegCompanies] = useState<{ companyId: number; name: string; fit: number; isAi: boolean; country: string; status: "trading" | "registered"; hs: string; queryId: number; itemName: string }[]>([])
  const [natlDesc, setNatlDesc] = useState(true)   // 국가 위험도 정렬(높은순/낮은순)
  const [compDesc, setCompDesc] = useState(true)   // 기업 적합도 정렬
  const [natlTradingOnly, setNatlTradingOnly] = useState(false)  // 국가: 거래중만/전체
  const [compTradingOnly, setCompTradingOnly] = useState(false)  // 기업: 거래중만/전체
  const [latestReport, setLatestReport] = useState<ReportOut | null>(null)
  const [userName, setUserName] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchDataStatus, setSearchDataStatus] = useState<"loading" | "ready" | "error">("loading")
  const [searchReloadKey, setSearchReloadKey] = useState(0)
  const searchRef = useRef<HTMLDivElement>(null)

  const periodDays = period === "최근 30일" ? 30 : period === "최근 90일" ? 90 : 7
  const monitoredItems = useMemo(() => {
    const uniqueItems = new Map<string, QueryOut>()
    queries.forEach((query) => {
      if (query.hs_code && !uniqueItems.has(query.hs_code)) uniqueItems.set(query.hs_code, query)
    })
    return [...uniqueItems.values()]
  }, [queries])
  const monitoredHsCodes = useMemo(() => new Set(monitoredItems.map((item) => item.hs_code)), [monitoredItems])
  const selectedItem = monitoredItems.find((item) => item.hs_code === selectedHsCode)
  // 선택 품목의 현재 거래국 ISO 코드(있으면). 추이 차트를 이 국가 기준으로 그린다.
  const selectedOriginCodes = useMemo(() => (selectedItem?.origin_country ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean)
    .map((n) => COUNTRY_OPTIONS.find((o) => o.name === n || o.code === n.toUpperCase())?.code ?? n.toUpperCase()),
    [selectedItem])
  const scoreTrend = useMemo(() => {
    const scoreByDate = new Map<string, number>()
    riskHistory.forEach((row) => {
      if (!selectedHsCode || row.hs_code !== selectedHsCode) return
      // 거래국이 지정돼 있으면 그 국가만, 없으면 공급국 중 최고값.
      if (selectedOriginCodes.length && !selectedOriginCodes.includes((row.country_code ?? "").toUpperCase())) return
      const score = Number(row.sgri_score ?? 0)
      scoreByDate.set(row.as_of_date, Math.max(scoreByDate.get(row.as_of_date) ?? 0, score))
    })
    return [...scoreByDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-periodDays)
      .map(([date, score]) => ({
        name: new Date(`${date}T00:00:00`).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
        score: Math.round(score),
      }))
  }, [periodDays, riskHistory, selectedHsCode, selectedOriginCodes])
  const risks = useMemo<RiskRow[]>(() => latestRiskRows(riskHistory)
    .filter((row) => row.hs_code && monitoredHsCodes.has(row.hs_code))
    .map((row) => {
      const query = monitoredItems.find((item) => item.hs_code === row.hs_code)
      return {
        item: query?.item_name?.trim() || (row.hs_code ? `HS ${row.hs_code}` : "품목명 없음"),
        hs: row.hs_code ?? "",
        code: `HS ${row.hs_code ?? ""}`,
        country: getCountryName(row.country_code),
        score: Math.round(Number(row.sgri_score ?? 0)),
        factor: "SGRI 종합 리스크 평가",
        level: row.level === "높음" ? "high" : row.level === "중간" ? "medium" : "low",
      }
    }), [monitoredHsCodes, monitoredItems, riskHistory])
  // 품목별 요약: 국가 위험도(현재 거래국 우선, 없으면 최고 SGRI) + 기업(1순위) — 위험 높은 순.
  const perItemRisk = useMemo(() => {
    const latest = new Map<string, RiskOut>()   // (hs|country) 최신
    riskHistory.forEach((r) => {
      if (!r.hs_code) return
      const key = `${r.hs_code}|${r.country_code}`
      const cur = latest.get(key)
      if (!cur || r.as_of_date > cur.as_of_date) latest.set(key, r)
    })
    const byHs = new Map<string, { code: string; sgri: number }[]>()
    latest.forEach((r) => {
      const arr = byHs.get(r.hs_code as string) ?? []
      arr.push({ code: r.country_code, sgri: r.sgri_score != null ? Math.round(Number(r.sgri_score)) : 0 })
      byHs.set(r.hs_code as string, arr)
    })
    const lvl = (s: number): "high" | "medium" | "low" => (s >= 50 ? "high" : s >= 25 ? "medium" : "low")
    const toCodes = (raw: string | undefined) => (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((n) => {
      const m = COUNTRY_OPTIONS.find((o) => o.name === n || o.code === n.toUpperCase())
      return m?.code ?? n.toUpperCase()
    })
    type Row = { hs: string; queryId: number; name: string; sgri: number | null; countryCode: string | null; status: "trading" | "registered" | "fallback"; level: "high" | "medium" | "low" | null }
    // 등록된 국가마다 한 행(거래중 + 관심 모두). 등록이 없으면 최고 위험국 하나(안전망).
    return monitoredItems.filter((it) => it.hs_code).flatMap((it): Row[] => {
      const countries = byHs.get(it.hs_code as string) ?? []
      const name = it.item_name?.trim() || `HS ${it.hs_code}`
      const originCodes = toCodes(it.origin_country)
      const tradingCodes = toCodes(it.trading_country)
      const regCodes = [...new Set([...originCodes, ...tradingCodes])]
      const sgriOf = (code: string) => countries.find((c) => c.code === code)?.sgri
      if (regCodes.length === 0) {
        const ref = [...countries].sort((a, b) => b.sgri - a.sgri)[0]  // 구 데이터 안전망
        return ref ? [{ hs: it.hs_code as string, queryId: it.query_id, name, sgri: ref.sgri, countryCode: ref.code, status: "fallback", level: lvl(ref.sgri) }] : []
      }
      return regCodes.map((code): Row => {
        const s = sgriOf(code)
        return { hs: it.hs_code as string, queryId: it.query_id, name, sgri: s ?? null, countryCode: code, status: tradingCodes.includes(code) ? "trading" : "registered", level: s != null ? lvl(s) : null }
      })
    }).sort((a, b) => (b.sgri ?? -1) - (a.sgri ?? -1))
  }, [riskHistory, monitoredItems])
  // 미니맵용: 선택 품목의 공급국(국가별 최신 SGRI)
  const mapPoints = useMemo<RiskPoint[]>(() => {
    const latest = new Map<string, RiskOut>()
    riskHistory.forEach((r) => {
      if (!selectedHsCode || r.hs_code !== selectedHsCode) return
      const cur = latest.get(r.country_code)
      if (!cur || r.as_of_date > cur.as_of_date) latest.set(r.country_code, r)
    })
    return [...latest.values()].map((r) => ({ code: r.country_code, sgri: r.sgri_score != null ? Math.round(Number(r.sgri_score)) : null }))
  }, [riskHistory, selectedHsCode])
  const searchResults = useMemo<SearchResult[]>(() => {
    const normalizedTerm = searchTerm.trim().toLocaleLowerCase("ko")
    if (!normalizedTerm) return []

    const compactTerm = normalizedTerm.replace(/[^0-9a-z]/g, "")
    const latestRisks = latestRiskRows(riskHistory)
    const results: SearchResult[] = []

    monitoredItems.forEach((item) => {
      const hsCode = item.hs_code
      if (!hsCode) return

      const itemName = item.item_name?.trim() || `HS ${hsCode}`
      const normalizedHsCode = hsCode.toLocaleLowerCase()
      const itemMatches = itemName.toLocaleLowerCase("ko").includes(normalizedTerm)
        || normalizedHsCode.includes(normalizedTerm)
        || (compactTerm.length > 0 && normalizedHsCode.replace(/[^0-9a-z]/g, "").includes(compactTerm))

      if (itemMatches) {
        results.push({ key: `item-${hsCode}`, hsCode, itemName })
      }

      latestRisks
        .filter((risk) => risk.hs_code === hsCode)
        .forEach((risk) => {
          const countryName = getCountryName(risk.country_code)
          const countryMatches = risk.country_code.toLocaleLowerCase().includes(normalizedTerm)
            || countryName.toLocaleLowerCase("ko").includes(normalizedTerm)
          if (!countryMatches) return

          results.push({
            key: `country-${hsCode}-${risk.country_code}`,
            hsCode,
            itemName,
            countryCode: risk.country_code,
            countryName,
            sgriScore: Math.round(Number(risk.sgri_score ?? 0)),
          })
        })
    })

    return results.slice(0, 8)
  }, [monitoredItems, riskHistory, searchTerm])
  const currentScore = scoreTrend.at(-1)?.score ?? 0
  const previousScore = scoreTrend.at(-2)?.score ?? currentScore
  const scoreChange = currentScore - previousScore
  const alertCount = alerts.filter((alert) => !alert.is_read).length
  // 최신 동향 카드: 실제 알림을 최신순 상위 4건으로 표시한다(하드코딩 뉴스 대체).
  const trend = useMemo(() => alerts.slice(0, 4).map((alert) => ({
    title: alert.title ?? alert.message ?? "리스크 알림",
    source: alert.alert_type ?? "SupplyGuard",
    time: alert.created_at ? new Date(alert.created_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : "",
    level: severityLabel(alert.severity),
    // 관련 뉴스 링크가 있으면 그곳으로, 없으면 해당 품목 리스크 상세로. (대체공급처로 보내지 않음)
    href: alert.source_url ?? (alert.hs_code ? `/risks/${alert.hs_code}` : "/alerts"),
    external: Boolean(alert.source_url),
  })), [alerts])

  // 검색과 품목 현황에 필요한 두 API를 함께 불러와 로딩·오류 상태를 구분한다.
  useEffect(() => {
    let isActive = true
    setSearchDataStatus("loading")

    Promise.all([api.getRisks(), api.getQueries()])
      .then(([riskRows, queryRows]) => {
        if (!isActive) return
        setRiskHistory(riskRows)
        setQueries(queryRows)
        setSelectedHsCode((current) => {
          if (queryRows.some((row) => row.hs_code === current)) return current
          return queryRows.find((row) => row.hs_code)?.hs_code ?? ""
        })
        setSearchDataStatus("ready")
      })
      .catch(() => {
        if (!isActive) return
        setRiskHistory([])
        setQueries([])
        setSelectedHsCode("")
        setSearchDataStatus("error")
      })

    return () => { isActive = false }
  }, [searchReloadKey])

  // 검색과 무관한 대시보드 데이터는 각각 독립적으로 불러온다.
  useEffect(() => {
    api.getAlerts().then(setAlerts).catch(() => setAlerts([]))
    api.getReports().then((rows) => setLatestReport(rows[0] ?? null)).catch(() => setLatestReport(null))
    api.getMe().then((user) => setUserName(user.name || user.email.split("@")[0])).catch(() => setUserName(""))
  }, [])

  // 선택 품목의 대체 공급국 추천을 실제 API에서 불러온다(하드코딩 목록 대체).
  useEffect(() => {
    if (!selectedItem) { setCountryRecos([]); setSupplierRecos([]); return }
    api.getCountryRecos(selectedItem.query_id)
      .then((rows) => setCountryRecos(rows.slice(0, 3)))
      .catch(() => setCountryRecos([]))
    api.getSupplierRecos(selectedItem.query_id)
      .then((rows) => setSupplierRecos(rows))
      .catch(() => setSupplierRecos([]))
  }, [selectedItem])

  // 사용자가 '거래중/등록'으로 지정한 기업만 모아 기업 적합도 카드에 표시.
  useEffect(() => {
    const items = monitoredItems.filter((i) => i.hs_code)
    if (items.length === 0) { setRegCompanies([]); return }
    let active = true
    const toIds = (raw: string | null | undefined) => new Set((raw ?? "").split(",").map((s) => Number(s.trim())).filter(Boolean))
    type Row = typeof regCompanies extends (infer T)[] ? T : never
    Promise.all(items.map((i) => {
      const reg = toIds(i.registered_company_ids)
      const tr = toIds(i.trading_company_ids)
      if (i.trading_company_id) { reg.add(i.trading_company_id); tr.add(i.trading_company_id) }
      if (reg.size === 0) return Promise.resolve<Row[]>([])
      return api.getSupplierRecos(i.query_id).then((rows): Row[] => rows
        .filter((r) => reg.has(r.company.company_id))
        .map((r) => ({
          companyId: r.company.company_id, name: r.company.name,
          fit: Math.round(Number(r.fit_score ?? 0)), isAi: (r.company.data_source ?? "").startsWith("ai:"),
          country: r.company.country_code ?? "", status: tr.has(r.company.company_id) ? "trading" : "registered",
          hs: i.hs_code as string, queryId: i.query_id, itemName: i.item_name?.trim() || `HS ${i.hs_code}`,
        }))
      ).catch((): Row[] => [])
    })).then((results) => { if (active) setRegCompanies(results.flat()) }).catch(() => {})
    return () => { active = false }
  }, [monitoredItems])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm">
              <ShieldAlert className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold tracking-tight">SupplyGuard</span>
          </div>
          <div className="hidden text-sm text-slate-400 sm:block">
            대시보드 <span className="mx-1.5">/</span> 공급망 현황
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            ref={searchRef}
            className="relative hidden md:block"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsSearchOpen(false)
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              role="combobox"
              aria-label="모니터링 품목과 국가 검색"
              aria-autocomplete="list"
              aria-controls="dashboard-search-results"
              aria-expanded={isSearchOpen && searchTerm.trim().length > 0}
              aria-busy={searchDataStatus === "loading"}
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value)
                setIsSearchOpen(true)
              }}
              onFocus={() => setIsSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setIsSearchOpen(false)
              }}
              className="w-80 border-slate-200 bg-slate-50 pl-9 text-sm focus:bg-white lg:w-96"
              placeholder="품목명, HS 코드, 국가 검색"
            />
            {isSearchOpen && searchTerm.trim() && (
              <div id="dashboard-search-results" role="listbox" className="absolute right-0 top-full z-50 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                {searchDataStatus === "loading" ? (
                  <div className="flex items-center gap-3 px-5 py-6 text-sm text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                    검색 데이터를 불러오는 중입니다.
                  </div>
                ) : searchDataStatus === "error" ? (
                  <div className="px-5 py-6 text-center">
                    <CircleAlert className="mx-auto h-6 w-6 text-rose-500" />
                    <p className="mt-2 text-sm font-medium text-slate-700">검색 데이터를 불러오지 못했습니다.</p>
                    <p className="mt-1 text-xs text-slate-500">네트워크 상태를 확인한 뒤 다시 시도해 주세요.</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setSearchReloadKey((current) => current + 1)} className="mt-4 border-slate-200">
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> 다시 시도
                    </Button>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="max-h-96 overflow-y-auto p-2">
                    {searchResults.map((result) => {
                      const isCountryResult = Boolean(result.countryCode)
                      const ResultIcon = isCountryResult ? Globe2 : Box
                      return (
                        <Link
                          role="option"
                          aria-selected="false"
                          key={result.key}
                          href={`/risks/${result.hsCode}`}
                          onClick={() => {
                            setSearchTerm("")
                            setIsSearchOpen(false)
                          }}
                          className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                        >
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isCountryResult ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
                            <ResultIcon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-800">
                              {isCountryResult ? `${result.countryName} (${result.countryCode})` : result.itemName}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500">
                              {isCountryResult ? `${result.itemName} · HS ${result.hsCode}` : `HS ${result.hsCode} · 리스크 상세 보기`}
                            </span>
                          </span>
                          {isCountryResult && <span className="text-xs font-semibold text-slate-500">SGRI {result.sgriScore}</span>}
                          <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                        </Link>
                      )
                    })}
                  </div>
                ) : (
                  <div className="px-5 py-8 text-center">
                    <Search className="mx-auto h-6 w-6 text-slate-300" />
                    <p className="mt-2 text-sm text-slate-500">일치하는 모니터링 품목이나 국가가 없습니다.</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <Button asChild variant="ghost" size="icon" className="relative text-slate-600">
            <Link href="/alerts"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Link>
          </Button>
          <Avatar className="h-8 w-8 border border-slate-200">
            <AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback>
          </Avatar>
        </div>
      </header>

      <div className="flex">
        {/* 좌측 사이드바는 공통 레이아웃(app/(app)/layout.tsx)이 제공 */}
        <main id="overview" className="min-w-0 flex-1 p-5 md:p-8">
          <section className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><span className="h-2 w-2 rounded-full bg-blue-500" /> 실시간 모니터링</div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">안녕하세요{userName ? `, ${userName}님` : ""}</h1>
              <p className="mt-1 text-sm text-slate-500">오늘 확인이 필요한 공급망 리스크가 <Link href="/alerts" className="font-semibold text-rose-600 underline decoration-rose-300 underline-offset-2 transition-colors hover:text-rose-700">{alertCount}건</Link> 있습니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2 border-slate-200 bg-white text-slate-600">{period}<ChevronDown className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {["최근 7일", "최근 30일", "최근 90일"].map((item) => <DropdownMenuItem key={item} onClick={() => setPeriod(item)}>{item}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button asChild className="bg-blue-600 shadow-sm hover:bg-blue-700"><Link href="/items/new"><Plus className="mr-2 h-4 w-4" />품목 등록</Link></Button>
            </div>
          </section>

          <section className="mb-7 grid gap-4 lg:grid-cols-2">
            {/* 국가 위험도 */}
            <Card className="border-2 border-rose-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><AlertTriangle className="h-5 w-5" /></span><div><CardTitle className="text-base">국가 위험도</CardTitle><CardDescription className="mt-0.5">등록 국가(거래중·관심)별 SGRI</CardDescription></div></div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setNatlTradingOnly((v) => !v)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${natlTradingOnly ? "border-blue-500 bg-blue-50 text-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{natlTradingOnly ? "거래중만" : "전체"}</button>
                  <button type="button" onClick={() => setNatlDesc((v) => !v)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50">{natlDesc ? "위험 높은순" : "낮은순"}<ArrowUpDown className="h-3 w-3" /></button>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                {[...perItemRisk].filter((r) => !natlTradingOnly || r.status === "trading").sort((a, b) => natlDesc ? (b.sgri ?? -1) - (a.sgri ?? -1) : (a.sgri ?? 1e9) - (b.sgri ?? 1e9)).slice(0, 5).map((row) => (
                  <Link key={`${row.hs}-${row.countryCode}`} href={row.countryCode ? `/risks/${row.hs}?country=${row.countryCode}` : `/risks/${row.hs}`} className="flex items-center gap-3 border-t border-slate-50 px-6 py-3 transition-colors hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.name}</p>
                      {row.countryCode && <p className="mt-0.5 truncate text-xs text-slate-400">{getCountryName(row.countryCode)} · <span className={row.status === "trading" ? "font-medium text-blue-600" : row.status === "registered" ? "font-medium text-emerald-600" : ""}>{row.status === "trading" ? "현재 거래국" : row.status === "registered" ? "등록 국가" : "최고 위험국"}</span></p>}
                    </div>
                    {row.sgri != null ? <><span className="text-2xl font-bold tracking-tight" style={{ color: mapRiskColor(row.sgri) }}>{row.sgri}</span><RiskBadge level={row.level ?? "low"} /></> : <span className="text-xs text-slate-300">미분석</span>}
                  </Link>
                ))}
                {perItemRisk.length === 0 ? <p className="px-6 py-8 text-center text-sm text-slate-400">등록된 품목이 없습니다.</p>
                  : natlTradingOnly && perItemRisk.every((r) => r.status !== "trading") ? <p className="px-6 py-8 text-center text-sm text-slate-400">현재 거래 중으로 표시한 국가가 없습니다.</p> : null}
              </CardContent>
            </Card>

            {/* 기업 적합도 */}
            <Card className="border-2 border-blue-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Building2 className="h-5 w-5" /></span><div><CardTitle className="text-base">기업 적합도</CardTitle><CardDescription className="mt-0.5">거래중·등록 기업 · 클릭 시 상세</CardDescription></div></div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setCompTradingOnly((v) => !v)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${compTradingOnly ? "border-blue-500 bg-blue-50 text-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{compTradingOnly ? "거래중만" : "전체"}</button>
                  <button type="button" onClick={() => setCompDesc((v) => !v)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50">{compDesc ? "적합도 높은순" : "낮은순"}<ArrowUpDown className="h-3 w-3" /></button>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                {[...regCompanies].filter((c) => !compTradingOnly || c.status === "trading").sort((a, b) => compDesc ? b.fit - a.fit : a.fit - b.fit).slice(0, 5).map((c) => (
                  <Link key={`${c.hs}-${c.companyId}`} href={`/suppliers/${c.companyId}?query_id=${c.queryId}`} className="flex items-center gap-3 border-t border-slate-50 px-6 py-3 transition-colors hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{getCountryName(c.country)} · <span className={c.status === "trading" ? "font-medium text-blue-600" : "font-medium text-emerald-600"}>{c.status === "trading" ? "현재 거래 기업" : "등록 기업"}</span> · {c.itemName}</p>
                    </div>
                    <span className="text-2xl font-bold tracking-tight text-slate-800">{c.fit}</span>
                    {c.isAi ? <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">AI 추정</Badge> : <Badge className="border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-50">실데이터</Badge>}
                  </Link>
                ))}
                {regCompanies.length === 0 ? <p className="px-6 py-8 text-center text-sm text-slate-400">거래중·등록으로 지정한 기업이 없어요. 기업 추천에서 지정할 수 있어요.</p>
                  : compTradingOnly && regCompanies.every((c) => c.status !== "trading") ? <p className="px-6 py-8 text-center text-sm text-slate-400">현재 거래 기업으로 지정한 곳이 없습니다.</p> : null}
              </CardContent>
            </Card>
          </section>

          {/* 지도(작게) + 리스크 추이 나란히 */}
          <section className="mb-7 grid gap-6 lg:grid-cols-2">
            <Link href="/map" className="group block">
              <Card className="h-full overflow-hidden border-2 border-cyan-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-600"><Globe2 className="h-5 w-5" /></span><div><CardTitle className="text-base">글로벌 공급망 지도</CardTitle><CardDescription className="mt-0.5">{selectedItem ? `공급국 ${mapPoints.length}개국` : "품목별 공급국 위험도"}</CardDescription></div></div>
                  <span className="flex items-center gap-1 text-sm font-medium text-blue-600 group-hover:underline">열기 <ArrowRight className="h-4 w-4" /></span>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="pointer-events-none h-44 overflow-hidden rounded-xl border border-slate-100">
                    <WorldRiskMap points={mapPoints} preview fill height={300} />
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Card className="border-2 border-violet-200 shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><TrendingUp className="h-4 w-4" /></span><div><CardTitle className="text-base">품목별 공급망 리스크 추이</CardTitle><CardDescription className="mt-1">{selectedItem ? `${selectedItem.item_name ?? `HS ${selectedItem.hs_code}`} · ${selectedOriginCodes.length ? "등록 국가" : "공급국"} 기준 SGRI · ${period}` : "모니터링 품목을 먼저 등록해 주세요."}</CardDescription></div></div>
                <select aria-label="위험도 품목 선택" value={selectedHsCode} onChange={(event) => setSelectedHsCode(event.target.value)} disabled={monitoredItems.length === 0} className="h-9 max-w-36 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"><option value="">품목 선택</option>{monitoredItems.map((item) => <option key={item.hs_code} value={item.hs_code}>{item.item_name ?? `HS ${item.hs_code}`}</option>)}</select>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="mb-3 flex items-baseline gap-2"><span className="text-3xl font-semibold">{currentScore}</span><span className={`text-sm font-medium ${scoreChange > 0 ? "text-rose-600" : "text-emerald-600"}`}>{scoreChange >= 0 ? "+" : ""}{scoreChange} <TrendingUp className="inline h-3.5 w-3.5" /></span></div>
                {scoreTrend.length > 0 ? <div className="h-44"><ResponsiveContainer width="100%" height="100%"><AreaChart data={scoreTrend} margin={{ top: 8, left: -24, right: 8, bottom: 0 }}><defs><linearGradient id="riskFill" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.22} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.08)" }} /><Area type="monotone" dataKey="score" name="SGRI 점수" stroke="#2563eb" strokeWidth={2.5} fill="url(#riskFill)" /></AreaChart></ResponsiveContainer></div> : <div className="grid h-44 place-items-center text-sm text-slate-400">위험도 이력 데이터가 없습니다.</div>}
              </CardContent>
            </Card>
          </section>

          {/* 하단: AI 브리핑 · 대체 공급국(품목 선택) · 최신 동향 */}
          <section className="grid gap-6 lg:grid-cols-3">
            <Card className="border-2 border-indigo-200 bg-gradient-to-br from-blue-50/80 to-cyan-50/50 shadow-sm">
              <CardHeader className="pb-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white"><Bot className="h-4 w-4" /></div><CardTitle className="text-base">AI 리스크 브리핑</CardTitle></div><Badge className="border-blue-100 bg-white text-blue-600 hover:bg-white">오늘</Badge></div></CardHeader>
              <CardContent><p className="text-sm leading-6 text-slate-600">{alerts[0]?.message ?? alerts[0]?.title ?? "새로운 리스크 브리핑 데이터가 없습니다."}</p><div className="mt-4 flex gap-2"><Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700"><Link href="/alerts">대응 전략 보기</Link></Button><Button asChild size="sm" variant="outline" className="border-blue-200 bg-white text-blue-700"><Link href="/reports/new">보고서 생성</Link></Button></div></CardContent>
            </Card>

            <Card id="alternatives" className="scroll-mt-20 border-2 border-emerald-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Globe2 className="h-4 w-4" /></span><div><CardTitle className="text-base">대체 공급국 추천</CardTitle><CardDescription className="mt-1">국가 차원 · 품목별</CardDescription></div></div>
                <select aria-label="대체공급국 품목 선택" value={selectedHsCode} onChange={(e) => setSelectedHsCode(e.target.value)} disabled={monitoredItems.length === 0} className="h-8 max-w-28 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">{monitoredItems.map((item) => <option key={item.hs_code} value={item.hs_code}>{item.item_name ?? `HS ${item.hs_code}`}</option>)}</select>
              </CardHeader>
              <CardContent className="space-y-3">
                {countryRecos.map((reco, index) => <div className="flex items-center gap-3 rounded-lg border border-slate-100 p-3" key={reco.country_code}><div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">{reco.country_code}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between"><span className="text-sm font-medium">{getCountryName(reco.country_code)}</span><span className="text-xs font-semibold text-emerald-600">적합도 {Math.round(Number(reco.fit_score ?? reco.sgri_score ?? 0))}</span></div><p className="mt-1 truncate text-xs text-slate-500">{reco.rationale ?? "SGRI 종합 평가 기반 추천"}</p></div>{index === 0 && <CheckCircle2 className="h-4 w-4 text-blue-600" />}</div>)}
                {countryRecos.length === 0 && <p className="py-6 text-center text-xs text-slate-400">추천 데이터가 없습니다.</p>}
                <Link href={selectedItem?.query_id ? `/recommendations?query_id=${selectedItem.query_id}` : "/recommendations"} className="block pt-1 text-center text-xs font-medium text-blue-600 hover:underline">전체 보기 →</Link>
              </CardContent>
            </Card>

            <Card className="border-2 border-amber-200 shadow-sm"><CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><Landmark className="h-4 w-4" /></span><div><CardTitle className="text-base">최신 동향</CardTitle><CardDescription className="mt-1">클릭하면 관련 뉴스·리스크 상세로 이동</CardDescription></div></CardHeader><CardContent className="px-0 pb-0">{trend.map((article, index) => {
              const inner = <><div className="mb-1 flex items-center justify-between gap-2"><span className="truncate text-sm font-medium group-hover:text-blue-600">{article.title}</span><span className={`shrink-0 text-[11px] font-medium ${article.level === "고위험" ? "text-rose-600" : article.level === "주의" ? "text-amber-600" : "text-emerald-600"}`}>{article.level}</span></div><p className="flex items-center gap-1 text-xs text-slate-400">{article.source}{article.time ? ` · ${article.time}` : ""}{article.external && <ExternalLink className="h-3 w-3" />}</p></>
              const cls = "group block border-t border-slate-100 px-6 py-3.5 transition-colors hover:bg-slate-50"
              return article.external
                ? <a className={cls} href={article.href} target="_blank" rel="noreferrer" key={`${article.title}-${index}`}>{inner}</a>
                : <Link className={cls} href={article.href} key={`${article.title}-${index}`}>{inner}</Link>
            })}{trend.length === 0 && <p className="px-6 py-6 text-center text-xs text-slate-400">최근 알림이 없습니다.</p>}</CardContent></Card>
          </section>

          <section id="reports" className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><ClipboardList className="h-4 w-4" /></div><div><p className="text-sm font-semibold">{latestReport?.title ?? "저장된 보고서가 없습니다"}</p><p className="text-xs text-slate-500">{latestReport ? `${latestReport.status ?? "draft"} · ${latestReport.created_at ? new Date(latestReport.created_at).toLocaleString("ko-KR") : "생성 시간 없음"}` : "분석 결과로 보고서를 생성해 보세요."}</p></div></div><Button asChild variant="outline" className="hidden border-slate-200 text-slate-700 sm:flex"><Link href={latestReport ? `/reports/${latestReport.report_id}` : "/reports/new"}>{latestReport ? "초안 열기" : "보고서 생성"} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></section>
        </main>
      </div>
    </div>
  )
}

function Metric({ icon: Icon, label, value, suffix, change, tone, href }: { icon: typeof ShieldAlert; label: string; value: string; suffix: string; change: string; tone: "rose" | "blue" | "amber" | "emerald"; href: string }) {
  const colors = {
    rose: "bg-rose-50 text-rose-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
  }
  return <Link href={href} className="group block"><Card className="border-slate-200 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md active:scale-[0.99]"><CardContent className="p-5"><div className="mb-5 flex items-center justify-between"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${colors[tone]}`}><Icon className="h-5 w-5" /></div><span className="flex items-center gap-1 text-xs font-medium text-slate-400 transition-colors group-hover:text-blue-600">{change}<ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" /></span></div><div><span className="text-3xl font-bold tracking-tight">{value}</span><span className="ml-1 text-sm text-slate-400">{suffix}</span></div><p className="mt-1 text-sm text-slate-500">{label}</p></CardContent></Card></Link>
}
