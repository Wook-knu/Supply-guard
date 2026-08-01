"use client"

// 서비스의 핵심 현황을 위험도·알림·보고서 API 기반으로 요약합니다.

import { useEffect, useMemo, useRef, useState } from "react"
import { api, type AlertOut, type CountryReco, type QueryOut, type ReportOut, type RiskOut } from "@/lib/api"
import { getCountryName } from "@/lib/countries"
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Bot,
  Box,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  CreditCard,
  FileText,
  FolderKanban,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  const [latestReport, setLatestReport] = useState<ReportOut | null>(null)
  const [userName, setUserName] = useState("")
  const [userPlan, setUserPlan] = useState("")
  const [userPicture, setUserPicture] = useState("")
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
  const scoreTrend = useMemo(() => {
    const scoreByDate = new Map<string, number>()
    riskHistory.forEach((row) => {
      if (!selectedHsCode || row.hs_code !== selectedHsCode) return
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
  }, [periodDays, riskHistory, selectedHsCode])
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
    api.getMe().then((user) => {
      setUserName(user.name || user.email.split("@")[0])
      setUserPlan(user.plan ? user.plan.charAt(0).toUpperCase() + user.plan.slice(1) : "Basic")
      setUserPicture(user.picture_url ?? "")
    }).catch(() => {
      setUserName("")
      setUserPlan("")
      setUserPicture("")
    })
  }, [])

  // 선택 품목의 대체 공급국 추천을 실제 API에서 불러온다(하드코딩 목록 대체).
  useEffect(() => {
    if (!selectedItem) { setCountryRecos([]); return }
    api.getCountryRecos(selectedItem.query_id)
      .then((rows) => setCountryRecos(rows.slice(0, 3)))
      .catch(() => setCountryRecos([]))
  }, [selectedItem])

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
          {userPlan && <Link href="/pricing"><Badge className="border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100">{userPlan}</Badge></Link>}
          <Avatar className="h-8 w-8 border border-slate-200">
            {userPicture && <AvatarImage src={userPicture} alt={`${userName || "사용자"} 프로필`} />}
            <AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">{userName ? userName.slice(0, 2).toUpperCase() : "SW"}</AvatarFallback>
          </Avatar>
        </div>
      </header>

      <div className="flex">
        <aside className="hidden min-h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
          <div className="p-4">
            <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">메뉴</p>
            <nav className="space-y-1">
              <a className="flex items-center gap-3 rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700" href="#overview">
                <Home className="h-4 w-4" /> 대시보드
              </a>
              <Link className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" href="/items">
                <Box className="h-4 w-4" /> 품목 관리
              </Link>
              <Link className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" href="/risks/283691">
                <CircleAlert className="h-4 w-4" /> 리스크 분석
              </Link>
              <Link className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" href="/recommendations">
                <Globe2 className="h-4 w-4" /> 대체 공급처
              </Link>
              <Link className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" href="/boards">
                <FolderKanban className="h-4 w-4" /> 조달 검토 보드
              </Link>
              <Link className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" href="/reports/new">
                <FileText className="h-4 w-4" /> AI 보고서
              </Link>
              <Link className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" href="/pricing">
                <CreditCard className="h-4 w-4" /> 구독·요금제
              </Link>
              <Link className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" href="/settings">
                <Settings className="h-4 w-4" /> 설정
              </Link>
            </nav>
          </div>
          <div className="mx-4 mt-5 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 p-4">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm"><Sparkles className="h-4 w-4" /></div>
            <p className="text-sm font-semibold">AI 리스크 브리핑</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">오늘의 공급망 변화를 2분 안에 확인하세요.</p>
            <Button variant="link" className="mt-2 h-auto p-0 text-xs font-semibold text-blue-700">브리핑 열기 <ArrowRight className="ml-1 h-3 w-3" /></Button>
          </div>
        </aside>

        <main id="overview" className="min-w-0 flex-1 p-5 md:p-8">
          <section className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><span className="h-2 w-2 rounded-full bg-blue-500" /> 실시간 모니터링</div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">안녕하세요{userName ? `, ${userName}님` : ""}</h1>
              <p className="mt-1 text-sm text-slate-500">오늘 확인이 필요한 공급망 리스크가 <span className="font-semibold text-rose-600">{alertCount}건</span> 있습니다.</p>
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

          <section className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={ShieldAlert} label="선택 품목 위험도" value={String(currentScore)} suffix="/ 100" change={`직전 대비 ${scoreChange >= 0 ? "+" : ""}${scoreChange}`} tone="rose" />
            <Metric icon={Box} label="모니터링 품목" value={String(monitoredItems.length)} suffix="개" change="내 등록 품목" tone="blue" />
            <Metric icon={AlertTriangle} label="활성 경보" value={String(alertCount)} suffix="건" change="실시간 집계" tone="amber" />
            <Metric icon={Globe2} label="대체 공급국" value={String(countryRecos.length)} suffix="개" change={selectedItem ? "추천 업데이트됨" : "품목 선택 시 표시"} tone="emerald" />
          </section>

          <section className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-6 xl:col-span-2">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">품목별 공급망 리스크 추이</CardTitle>
                    <CardDescription className="mt-1">{selectedItem ? `${selectedItem.item_name ?? `HS ${selectedItem.hs_code}`} · 공급국 중 최고 SGRI · ${period}` : "모니터링 품목을 먼저 등록해 주세요."}</CardDescription>
                  </div>
                  <select aria-label="위험도 품목 선택" value={selectedHsCode} onChange={(event) => setSelectedHsCode(event.target.value)} disabled={monitoredItems.length === 0} className="h-9 max-w-56 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"><option value="">품목 선택</option>{monitoredItems.map((item) => <option key={item.hs_code} value={item.hs_code}>{item.item_name ?? `HS ${item.hs_code}`}</option>)}</select>
                </CardHeader>
                <CardContent className="pt-5">
                  <div className="mb-3 flex items-baseline gap-2"><span className="text-3xl font-semibold">{currentScore}</span><span className={`text-sm font-medium ${scoreChange > 0 ? "text-rose-600" : "text-emerald-600"}`}>{scoreChange >= 0 ? "+" : ""}{scoreChange} <TrendingUp className="inline h-3.5 w-3.5" /></span></div>
                  {scoreTrend.length > 0 ? <div className="h-52"><ResponsiveContainer width="100%" height="100%"><AreaChart data={scoreTrend} margin={{ top: 8, left: -24, right: 8, bottom: 0 }}><defs><linearGradient id="riskFill" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.22} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.08)" }} /><Area type="monotone" dataKey="score" name="SGRI 점수" stroke="#2563eb" strokeWidth={2.5} fill="url(#riskFill)" /></AreaChart></ResponsiveContainer></div> : <div className="grid h-52 place-items-center text-sm text-slate-400">위험도 이력 데이터가 없습니다.</div>}
                </CardContent>
              </Card>

              <Card id="risks" className="scroll-mt-20 border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <div><CardTitle className="text-base">고위험 품목</CardTitle><CardDescription className="mt-1">우선 대응이 필요한 품목과 공급국입니다.</CardDescription></div>
                  <Button variant="outline" size="sm" onClick={() => setShowAllRisks(!showAllRisks)}>{showAllRisks ? "간략히 보기" : "전체 보기"}<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <Table><TableHeader><TableRow className="bg-slate-50 hover:bg-slate-50"><TableHead className="pl-6">품목</TableHead><TableHead>주요 공급국</TableHead><TableHead>위험도</TableHead><TableHead className="hidden lg:table-cell">주요 원인</TableHead><TableHead className="w-10" /></TableRow></TableHeader><TableBody>{risks.slice(0, showAllRisks ? risks.length : 3).map((risk) => <TableRow key={`${risk.code}-${risk.country}`} className="hover:bg-slate-50"><TableCell className="pl-6"><Link href={`/risks/${risk.hs}`} className="font-medium hover:text-blue-600">{risk.item}</Link><div className="mt-0.5 text-xs text-slate-400">{risk.code}</div></TableCell><TableCell><span className="text-sm">{risk.country}</span></TableCell><TableCell><div className="flex items-center gap-2"><RiskBadge level={risk.level} /><span className="text-xs font-medium text-rose-600">{risk.score}</span></div></TableCell><TableCell className="hidden text-sm text-slate-500 lg:table-cell">{risk.factor}</TableCell><TableCell><Button asChild variant="ghost" size="icon" className="h-8 w-8"><Link href={`/risks/${risk.hs}`}><MoreHorizontal className="h-4 w-4" /></Link></Button></TableCell></TableRow>)}</TableBody></Table>
                  {risks.length === 0 && <p className="py-8 text-center text-sm text-slate-400">조회된 위험 데이터가 없습니다.</p>}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="border-blue-100 bg-gradient-to-br from-blue-50/80 to-cyan-50/50 shadow-sm">
                <CardHeader className="pb-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white"><Bot className="h-4 w-4" /></div><CardTitle className="text-base">AI 리스크 브리핑</CardTitle></div><Badge className="border-blue-100 bg-white text-blue-600 hover:bg-white">오늘</Badge></div></CardHeader>
                <CardContent><p className="text-sm leading-6 text-slate-600">{alerts[0]?.message ?? alerts[0]?.title ?? "새로운 리스크 브리핑 데이터가 없습니다."}</p><div className="mt-4 flex gap-2"><Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700"><Link href="/alerts">대응 전략 보기</Link></Button><Button asChild size="sm" variant="outline" className="border-blue-200 bg-white text-blue-700"><Link href="/reports/new">보고서 생성</Link></Button></div></CardContent>
              </Card>

              <Card id="alternatives" className="scroll-mt-20 border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3"><div><CardTitle className="text-base">대체 공급국 추천</CardTitle><CardDescription className="mt-1">{selectedItem ? `${selectedItem.item_name ?? `HS ${selectedItem.hs_code}`} 기준` : "품목을 선택하면 표시됩니다"}</CardDescription></div><Button asChild variant="ghost" size="sm" className="text-blue-600"><Link href="/recommendations">전체 보기</Link></Button></CardHeader><CardContent className="space-y-3">{countryRecos.map((reco, index) => <div className="flex items-center gap-3 rounded-lg border border-slate-100 p-3" key={reco.country_code}><div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">{reco.country_code}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between"><span className="text-sm font-medium">{getCountryName(reco.country_code)}</span><span className="text-xs font-semibold text-emerald-600">적합도 {Math.round(Number(reco.fit_score ?? reco.sgri_score ?? 0))}</span></div><p className="mt-1 truncate text-xs text-slate-500">{reco.rationale ?? "SGRI 종합 평가 기반 추천"}</p></div>{index === 0 && <CheckCircle2 className="h-4 w-4 text-blue-600" />}</div>)}{countryRecos.length === 0 && <p className="py-6 text-center text-xs text-slate-400">추천 데이터가 없습니다.</p>}</CardContent></Card>

              <Card className="border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><div><CardTitle className="text-base">최신 동향</CardTitle><CardDescription className="mt-1">최근 위험 알림 및 정책 변화</CardDescription></div><Landmark className="h-4 w-4 text-slate-400" /></CardHeader><CardContent className="px-0 pb-0">{trend.map((article, index) => <div className="border-t border-slate-100 px-6 py-3.5" key={`${article.title}-${index}`}><div className="mb-1 flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{article.title}</span><span className={`shrink-0 text-[11px] font-medium ${article.level === "고위험" ? "text-rose-600" : article.level === "주의" ? "text-amber-600" : "text-emerald-600"}`}>{article.level}</span></div><p className="text-xs text-slate-400">{article.source}{article.time ? ` · ${article.time}` : ""}</p></div>)}{trend.length === 0 && <p className="px-6 py-6 text-center text-xs text-slate-400">최근 알림이 없습니다.</p>}</CardContent></Card>
            </div>
          </section>

          <section id="reports" className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><ClipboardList className="h-4 w-4" /></div><div><p className="text-sm font-semibold">{latestReport?.title ?? "저장된 보고서가 없습니다"}</p><p className="text-xs text-slate-500">{latestReport ? `${latestReport.status ?? "draft"} · ${latestReport.created_at ? new Date(latestReport.created_at).toLocaleString("ko-KR") : "생성 시간 없음"}` : "분석 결과로 보고서를 생성해 보세요."}</p></div></div><Button asChild variant="outline" className="hidden border-slate-200 text-slate-700 sm:flex"><Link href={latestReport ? `/reports/${latestReport.report_id}` : "/reports/new"}>{latestReport ? "초안 열기" : "보고서 생성"} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></section>
        </main>
      </div>
    </div>
  )
}

function Metric({ icon: Icon, label, value, suffix, change, tone }: { icon: typeof ShieldAlert; label: string; value: string; suffix: string; change: string; tone: "rose" | "blue" | "amber" | "emerald" }) {
  const colors = {
    rose: "bg-rose-50 text-rose-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
  }
  return <Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><div className="mb-5 flex items-center justify-between"><div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[tone]}`}><Icon className="h-4 w-4" /></div><span className="text-xs font-medium text-slate-400">{change}</span></div><div><span className="text-2xl font-semibold tracking-tight">{value}</span><span className="ml-1 text-sm text-slate-400">{suffix}</span></div><p className="mt-1 text-sm text-slate-500">{label}</p></CardContent></Card>
}
