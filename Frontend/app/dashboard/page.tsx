"use client"

// 서비스의 핵심 현황을 요약하는 대시보드 화면입니다.
// 아래 배열들은 UI 검증용 데모 데이터이며 실제 서비스에서는 위험 분석 API 응답으로 교체합니다.

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
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
  FileText,
  Globe2,
  Home,
  Landmark,
  MoreHorizontal,
  Plus,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"

const scoreTrend = [
  { name: "7/21", score: 46 },
  { name: "7/22", score: 51 },
  { name: "7/23", score: 49 },
  { name: "7/24", score: 58 },
  { name: "7/25", score: 62 },
  { name: "7/26", score: 65 },
  { name: "오늘", score: 68 },
]

type RiskRow = { item: string; code: string; country: string; score: number; factor: string; level: "high" | "medium" | "low"; change?: string }
const HS_NAME: Record<string, string> = { "283691": "리튬 탄산염" }
const COUNTRY_NAME: Record<string, string> = { CL: "칠레", CN: "중국", AU: "호주", CA: "캐나다", US: "미국", KR: "한국" }

const FALLBACK_RISKS: RiskRow[] = [
  {
    item: "리튬 탄산염",
    code: "HS 2836.91",
    country: "중국",
    score: 82,
    factor: "수출 규제 · 공급국 집중",
    change: "+12",
    level: "high",
  },
  {
    item: "차량용 MCU",
    code: "HS 8542.31",
    country: "대만",
    score: 74,
    factor: "지정학 · 해상 물류 지연",
    change: "+8",
    level: "high",
  },
  {
    item: "천연 흑연",
    code: "HS 2504.10",
    country: "중국",
    score: 67,
    factor: "수출 허가 · 가격 변동",
    change: "+4",
    level: "medium",
  },
  {
    item: "황산니켈",
    code: "HS 2833.24",
    country: "인도네시아",
    score: 43,
    factor: "기상 · 항만 혼잡",
    change: "-3",
    level: "low",
  },
]

const news = [
  { title: "중국, 흑연 수출 허가 대상 확대 검토", source: "Reuters", time: "24분 전", level: "고위험" },
  { title: "대만 해협 악천후로 선적 일정 일부 지연", source: "Lloyd's List", time: "2시간 전", level: "주의" },
  { title: "인도네시아 니켈 생산량 전망 상향", source: "Bloomberg", time: "5시간 전", level: "안정" },
]

const alternatives = [
  { country: "호주", flag: "AU", score: 82, reason: "낮은 지정학 위험 · 안정적 광물 공급" },
  { country: "칠레", flag: "CL", score: 76, reason: "가격 경쟁력 · 리튬 생산 기반" },
  { country: "캐나다", flag: "CA", score: 72, reason: "ESG 적합 · FTA 활용 가능" },
]

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
  const [risks, setRisks] = useState<RiskRow[]>(FALLBACK_RISKS)
  const [alertCount, setAlertCount] = useState<number | null>(null)

  // 고위험 품목(/risks)과 활성 경보 수(/alerts)를 백엔드에서 불러온다. 실패 시 데모 유지.
  useEffect(() => {
    api.getRisks().then((rows) => {
      if (!rows.length) return
      setRisks(rows.map((r) => ({
        item: HS_NAME[r.hs_code ?? ""] ?? (r.hs_code ?? "품목"),
        code: `HS ${r.hs_code ?? ""}`,
        country: COUNTRY_NAME[r.country_code] ?? r.country_code,
        score: Math.round(Number(r.sgri_score ?? 0)),
        factor: "SGRI 종합 리스크 평가",
        level: r.level === "높음" ? "high" : r.level === "중간" ? "medium" : "low",
      })))
    }).catch(() => {})
    api.getAlerts().then((rows) => setAlertCount(rows.length)).catch(() => {})
  }, [])

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
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="w-72 border-slate-200 bg-slate-50 pl-9 text-sm focus:bg-white" placeholder="품목, 국가, 공급사 검색" />
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
        <aside className="hidden min-h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
          <div className="p-4">
            <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">메뉴</p>
            <nav className="space-y-1">
              <a className="flex items-center gap-3 rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700" href="#overview">
                <Home className="h-4 w-4" /> 대시보드
              </a>
              <Link className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" href="/risks/lithium-carbonate">
                <CircleAlert className="h-4 w-4" /> 리스크 분석
              </Link>
              <Link className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" href="/recommendations">
                <Globe2 className="h-4 w-4" /> 대체 공급처
              </Link>
              <Link className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" href="/reports/july-lithium-risk">
                <FileText className="h-4 w-4" /> AI 보고서
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
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">안녕하세요, 전상욱님</h1>
              <p className="mt-1 text-sm text-slate-500">오늘 확인이 필요한 공급망 리스크가 <span className="font-semibold text-rose-600">{alertCount ?? 3}건</span> 있습니다.</p>
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
            <Metric icon={ShieldAlert} label="종합 위험도" value="68" suffix="/ 100" change="지난주 대비 +6" tone="rose" />
            <Metric icon={Box} label="모니터링 품목" value="12" suffix="개" change="이번 달 +2개" tone="blue" />
            <Metric icon={AlertTriangle} label="활성 경보" value={String(alertCount ?? 7)} suffix="건" change="실시간 집계" tone="amber" />
            <Metric icon={Globe2} label="대체 공급국" value="4" suffix="개" change="추천 업데이트됨" tone="emerald" />
          </section>

          <section className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-6 xl:col-span-2">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">공급망 리스크 추이</CardTitle>
                    <CardDescription className="mt-1">SGRI 점수 변화 · {period}</CardDescription>
                  </div>
                  <Tabs defaultValue="score" className="w-auto">
                    <TabsList className="h-8 bg-slate-100"><TabsTrigger className="px-3 text-xs" value="score">위험도</TabsTrigger><TabsTrigger className="px-3 text-xs" value="alerts">경보</TabsTrigger></TabsList>
                  </Tabs>
                </CardHeader>
                <CardContent className="pt-5">
                  <div className="mb-3 flex items-baseline gap-2"><span className="text-3xl font-semibold">68</span><span className="text-sm font-medium text-rose-600">+6.2% <TrendingUp className="inline h-3.5 w-3.5" /></span></div>
                  <div className="h-52"><ResponsiveContainer width="100%" height="100%"><AreaChart data={scoreTrend} margin={{ top: 8, left: -24, right: 8, bottom: 0 }}><defs><linearGradient id="riskFill" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.22} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.08)" }} /><Area type="monotone" dataKey="score" name="SGRI 점수" stroke="#2563eb" strokeWidth={2.5} fill="url(#riskFill)" /></AreaChart></ResponsiveContainer></div>
                </CardContent>
              </Card>

              <Card id="risks" className="scroll-mt-20 border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <div><CardTitle className="text-base">고위험 품목</CardTitle><CardDescription className="mt-1">우선 대응이 필요한 품목과 공급국입니다.</CardDescription></div>
                  <Button variant="outline" size="sm" onClick={() => setShowAllRisks(!showAllRisks)}>{showAllRisks ? "간략히 보기" : "전체 보기"}<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <Table><TableHeader><TableRow className="bg-slate-50 hover:bg-slate-50"><TableHead className="pl-6">품목</TableHead><TableHead>주요 공급국</TableHead><TableHead>위험도</TableHead><TableHead className="hidden lg:table-cell">주요 원인</TableHead><TableHead className="w-10" /></TableRow></TableHeader><TableBody>{risks.slice(0, showAllRisks ? risks.length : 3).map((risk) => <TableRow key={`${risk.country}-${risk.item}`} className="hover:bg-slate-50"><TableCell className="pl-6"><Link href="/risks/lithium-carbonate" className="font-medium hover:text-blue-600">{risk.item}</Link><div className="mt-0.5 text-xs text-slate-400">{risk.code}</div></TableCell><TableCell><span className="text-sm">{risk.country}</span></TableCell><TableCell><div className="flex items-center gap-2"><RiskBadge level={risk.level} /><span className="text-xs font-medium text-rose-600">{risk.score}</span></div></TableCell><TableCell className="hidden text-sm text-slate-500 lg:table-cell">{risk.factor}</TableCell><TableCell><Button asChild variant="ghost" size="icon" className="h-8 w-8"><Link href="/risks/lithium-carbonate"><MoreHorizontal className="h-4 w-4" /></Link></Button></TableCell></TableRow>)}</TableBody></Table>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="border-blue-100 bg-gradient-to-br from-blue-50/80 to-cyan-50/50 shadow-sm">
                <CardHeader className="pb-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white"><Bot className="h-4 w-4" /></div><CardTitle className="text-base">AI 리스크 브리핑</CardTitle></div><Badge className="border-blue-100 bg-white text-blue-600 hover:bg-white">오늘</Badge></div></CardHeader>
                <CardContent><p className="text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-800">중국산 핵심 광물</span>의 수출 규제 관련 뉴스가 증가했습니다. 리튬 탄산염과 천연 흑연은 호주·칠레 공급처를 병행 검토하는 것이 좋습니다.</p><div className="mt-4 flex gap-2"><Button size="sm" className="bg-blue-600 hover:bg-blue-700">대응 전략 보기</Button><Button size="sm" variant="outline" className="border-blue-200 bg-white text-blue-700">보고서 생성</Button></div></CardContent>
              </Card>

              <Card id="alternatives" className="scroll-mt-20 border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3"><div><CardTitle className="text-base">대체 공급국 추천</CardTitle><CardDescription className="mt-1">리튬 탄산염 기준</CardDescription></div><Button variant="ghost" size="sm" className="text-blue-600">전체 보기</Button></CardHeader><CardContent className="space-y-3">{alternatives.map((alternative, index) => <div className="flex items-center gap-3 rounded-lg border border-slate-100 p-3" key={alternative.country}><div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">{alternative.flag}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between"><span className="text-sm font-medium">{alternative.country}</span><span className="text-xs font-semibold text-emerald-600">적합도 {alternative.score}</span></div><p className="mt-1 truncate text-xs text-slate-500">{alternative.reason}</p></div>{index === 0 && <CheckCircle2 className="h-4 w-4 text-blue-600" />}</div>)}</CardContent></Card>

              <Card className="border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><div><CardTitle className="text-base">최신 동향</CardTitle><CardDescription className="mt-1">연관 뉴스 및 정책 변화</CardDescription></div><Landmark className="h-4 w-4 text-slate-400" /></CardHeader><CardContent className="px-0 pb-0">{news.map((article) => <div className="border-t border-slate-100 px-6 py-3.5" key={article.title}><div className="mb-1 flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{article.title}</span><span className={`shrink-0 text-[11px] font-medium ${article.level === "고위험" ? "text-rose-600" : article.level === "주의" ? "text-amber-600" : "text-emerald-600"}`}>{article.level}</span></div><p className="text-xs text-slate-400">{article.source} · {article.time}</p></div>)}</CardContent></Card>
            </div>
          </section>

          <section id="reports" className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><ClipboardList className="h-4 w-4" /></div><div><p className="text-sm font-semibold">7월 공급망 리스크 보고서</p><p className="text-xs text-slate-500">AI가 최신 분석 결과를 반영했습니다.</p></div></div><Button variant="outline" className="hidden border-slate-200 text-slate-700 sm:flex">초안 열기 <ArrowRight className="ml-2 h-4 w-4" /></Button></section>
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
