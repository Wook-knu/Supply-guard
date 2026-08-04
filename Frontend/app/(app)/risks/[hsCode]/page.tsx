"use client"

// 품목(HS 코드)별 SGRI 리스크 상세 — /risks/{hsCode} 동적 경로.
// 실데이터: GET /risks?hs_code=… (국가별 6지표 S·C·V·L·P·E + 종합 SGRI)

import Link from "next/link"
import BackLink from "@/components/back-link"
import { useSearchParams } from "next/navigation"
import { use, useEffect, useMemo, useState } from "react"
import { ArrowRight, Bot, CircleAlert, FileText, ShieldAlert, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { api, type RiskOut } from "@/lib/api"
import { COUNTRY_OPTIONS, getCountryName } from "@/lib/countries"
import AlertBell from "@/components/alert-bell"
import UserAvatar from "@/components/user-avatar"

// 콤마 국가명/코드 → ISO 코드 집합
function toCodeSet(raw: string | null | undefined): Set<string> {
  const s = new Set<string>()
  ;(raw ?? "").split(",").forEach((x) => {
    const t = x.trim(); if (!t) return
    const m = COUNTRY_OPTIONS.find((o) => o.name === t || o.code === t.toUpperCase())
    s.add(m?.code ?? t.toUpperCase())
  })
  return s
}

// 6지표 메타 (표시 순서·라벨)
const INDICATORS: { key: keyof RiskOut; label: string; note: string }[] = [
  { key: "score_c", label: "공급국 집중도", note: "특정국 편중(HHI 기반)" },
  { key: "score_p", label: "국가·정책 위험", note: "거버넌스·규제 지표" },
  { key: "score_s", label: "수급 불안정성", note: "수입량 변동계수" },
  { key: "score_v", label: "가격 변동성", note: "원자재·환율 변동" },
  { key: "score_l", label: "물류·운송 위험", note: "항만·물류 성과" },
  { key: "score_e", label: "ESG·탄소 규제", note: "배출계수 기반" },
]

function num(v: string | null): number { return Math.round(Number(v ?? 0)) }
function levelOf(score: number): "high" | "medium" | "low" { return score >= 50 ? "high" : score >= 25 ? "medium" : "low" }
function toneOf(score: number): string { return score >= 50 ? "text-rose-600" : score >= 25 ? "text-amber-600" : "text-emerald-600" }
const LEVEL_LABEL = { high: "고위험", medium: "주의", low: "안정" }

export default function RiskDetailPage({ params }: { params: Promise<{ hsCode: string }> }) {
  const { hsCode } = use(params)
  const paramCountry = useSearchParams().get("country")
  const [rows, setRows] = useState<RiskOut[]>([])
  const [loaded, setLoaded] = useState(false)
  const [queryId, setQueryId] = useState<number | null>(null)
  const [queryName, setQueryName] = useState<string | null>(null)
  const [originCodes, setOriginCodes] = useState<Set<string>>(new Set())     // 등록 국가
  const [tradingCodes, setTradingCodes] = useState<Set<string>>(new Set())   // 거래중 국가
  const [focusCode, setFocusCode] = useState<string | null>(paramCountry)    // 순위에서 클릭해 바꿀 수 있음

  useEffect(() => {
    api.getRisks(hsCode)
      .then((data) => setRows(data))
      .catch(() => setRows([]))
      .finally(() => setLoaded(true))
    // 이 HS로 등록된 내 품목을 찾아 query_id·등록국가 확보
    api.getQueries()
      .then((qs) => {
        const q = qs.find((row) => (row.hs_code ?? "") === hsCode)
        setQueryId(q?.query_id ?? null)
        setQueryName(q?.item_name?.trim() || null)
        setOriginCodes(toCodeSet(q?.origin_country))
        setTradingCodes(toCodeSet(q?.trading_country))
      })
      .catch(() => {})
  }, [hsCode])

  // 추천/보고서 링크(query_id 있으면 붙임)
  const recoHref = queryId != null ? `/recommendations?query_id=${queryId}` : "/recommendations"
  const reportHref = queryId != null ? `/reports/new?query_id=${queryId}` : "/reports/new"
  // 품목명은 내 품목(/queries)에서 온 것만 쓴다. 없으면 HS 코드로 표기.
  const itemName = queryName ?? `HS ${hsCode}`
  // GET /risks 는 as_of_date별 이력을 모두 반환하므로 한 국가가 여러 행으로 온다.
  // 국가별 최신 스냅샷만 남겨야 중복 표시·중복 key·'N개국' 오집계를 막을 수 있다.
  const latestByCountry = useMemo(() => {
    const latest = new Map<string, RiskOut>()
    rows.forEach((row) => {
      const current = latest.get(row.country_code)
      if (!current || row.as_of_date > current.as_of_date) latest.set(row.country_code, row)
    })
    return [...latest.values()]
  }, [rows])
  // 국가를 SGRI 높은 순으로 정렬
  const ranked = useMemo(() => [...latestByCountry].sort((a, b) => num(b.sgri_score) - num(a.sgri_score)), [latestByCountry])
  const worst = ranked[0]
  // 대표 국가: (순위 클릭) → 거래중 → 관심(등록) → (안전망)최고 위험국. 최고SGRI 자동선택 안 함.
  const ref = useMemo(() => {
    if (focusCode) { const f = latestByCountry.find((r) => r.country_code === focusCode); if (f) return f }
    const t = ranked.find((r) => tradingCodes.has(r.country_code)); if (t) return t
    const o = ranked.find((r) => originCodes.has(r.country_code)); if (o) return o
    return worst
  }, [latestByCountry, ranked, focusCode, tradingCodes, originCodes, worst])
  const refStatus: "trading" | "registered" | "focus" | "fallback" =
    ref && tradingCodes.has(ref.country_code) ? "trading"
    : ref && originCodes.has(ref.country_code) ? "registered"
    : focusCode && ref?.country_code === focusCode ? "focus" : "fallback"
  const refStatusLabel = { trading: "현재 거래국", registered: "등록 국가", focus: "선택 국가", fallback: "최고 위험국" }[refStatus]
  const topScore = ref ? num(ref.sgri_score) : 0
  const topLevel = levelOf(topScore)

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <Link href="/dashboard" className="flex items-center gap-2.5 lg:hidden"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link>
      <div className="ml-auto flex items-center gap-3"><AlertBell /><UserAvatar /></div>
    </header>
    <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
      <BackLink />
      <div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className={`mb-2 flex items-center gap-2 text-sm font-medium ${toneOf(topScore)}`}><span className={`h-2 w-2 rounded-full ${topLevel === "high" ? "bg-rose-500" : topLevel === "medium" ? "bg-amber-500" : "bg-emerald-500"}`} /> {LEVEL_LABEL[topLevel]} 모니터링</div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{itemName} 리스크 분석</h1>
          <p className="mt-2 text-sm text-slate-500">HS {hsCode} · 분석 대상 공급국 {latestByCountry.length}개국{ref ? ` · ${refStatusLabel} ${getCountryName(ref.country_code)}` : ""}</p>
        </div>
      </div>

      {!loaded ? <p className="mt-16 text-center text-sm text-slate-400">불러오는 중…</p>
        : rows.length === 0 ? <div className="mt-16 text-center text-sm text-slate-500">해당 품목의 위험 데이터가 없습니다.<div className="mt-3"><Button asChild variant="outline"><Link href="/dashboard">대시보드로</Link></Button></div></div>
        : <>
        <section className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-4">
          <Card className={`shadow-sm ${topLevel === "high" ? "border-rose-100 bg-gradient-to-br from-rose-50 to-white" : topLevel === "medium" ? "border-amber-100 bg-gradient-to-br from-amber-50 to-white" : "border-emerald-100 bg-gradient-to-br from-emerald-50 to-white"}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-600">{refStatusLabel} SGRI ({ref ? getCountryName(ref.country_code) : "-"})</span><CircleAlert className={`h-5 w-5 ${toneOf(topScore)}`} /></div>
              <div className="mt-5 flex items-end gap-2"><span className={`text-5xl font-semibold tracking-tight ${toneOf(topScore)}`}>{topScore}</span><span className="mb-1 text-sm text-slate-400">/ 100</span></div>
              <div className="mt-4"><Badge className={`border ${topLevel === "high" ? "border-rose-100 bg-rose-100 text-rose-700 hover:bg-rose-100" : topLevel === "medium" ? "border-amber-100 bg-amber-100 text-amber-700 hover:bg-amber-100" : "border-emerald-100 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"}`}>{LEVEL_LABEL[topLevel]}</Badge></div>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">{topLevel === "high" ? "즉시 대체 공급국 검토가 권장되는 수준입니다." : topLevel === "medium" ? "주기적 모니터링과 대체 후보 확보를 권장합니다." : "현재 안정 범위이나 변동을 지켜보세요."}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm lg:col-span-3">
            <CardHeader className="pb-2"><CardTitle className="text-base">SGRI 구성 항목 — {ref ? getCountryName(ref.country_code) : ""}</CardTitle><CardDescription className="mt-1">6개 지표(공식 산출)의 {refStatusLabel} 점수입니다.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-8 gap-y-5 pt-3 sm:grid-cols-2">
              {INDICATORS.map((ind) => {
                const v = ref ? num(ref[ind.key] as string | null) : 0
                return <div key={ind.key}>
                  <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">{ind.label}</p><p className="mt-0.5 text-xs text-slate-500">{ind.note}</p></div><span className={`text-sm font-semibold ${toneOf(v)}`}>{v}</span></div>
                  <Progress value={v} className="mt-2 h-2" />
                </div>
              })}
            </CardContent>
          </Card>
        </section>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="border-slate-200 shadow-sm xl:col-span-2">
            <CardHeader className="pb-3"><CardTitle className="text-base">공급국 위험 순위</CardTitle><CardDescription className="mt-1">SGRI가 높은(위험한) 순서 · 국가를 누르면 위 상세가 그 국가로 바뀝니다.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {ranked.map((r, i) => { const s = num(r.sgri_score); const lv = levelOf(s); const isRef = ref?.country_code === r.country_code; return <button type="button" key={r.country_code} onClick={() => setFocusCode(r.country_code)} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${isRef ? "border-blue-300 bg-blue-50/60 ring-1 ring-blue-200" : "border-slate-100 hover:bg-slate-50"}`}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{i + 1}</span>
                <span className="w-10 shrink-0 text-[11px] font-bold text-slate-500">{r.country_code}</span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm font-medium">{getCountryName(r.country_code)}{tradingCodes.has(r.country_code) ? <Badge className="border-0 bg-blue-600 px-1.5 py-0 text-[10px] text-white hover:bg-blue-600">거래중</Badge> : originCodes.has(r.country_code) ? <Badge className="border-slate-200 bg-slate-100 px-1.5 py-0 text-[10px] text-slate-600 hover:bg-slate-100">관심</Badge> : null}</span>
                <Badge className={`border text-[10px] ${lv === "high" ? "border-rose-100 bg-rose-50 text-rose-600" : lv === "medium" ? "border-amber-100 bg-amber-50 text-amber-600" : "border-emerald-100 bg-emerald-50 text-emerald-600"} hover:bg-inherit`}>{LEVEL_LABEL[lv]}</Badge>
                <span className={`w-8 text-right text-sm font-semibold ${toneOf(s)}`}>{s}</span>
              </button> })}
            </CardContent>
          </Card>
          <aside className="space-y-6">
            <Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-sm">
              <CardHeader className="pb-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white"><Bot className="h-4 w-4" /></div><CardTitle className="mt-3 text-base">지금 할 일</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Action number="1" title="저위험 공급국 견적 요청" note={`${ranked.filter((r) => levelOf(num(r.sgri_score)) === "low").length}개국이 안정 범위입니다.`} />
                <Action number="2" title="안전재고 확보 검토" note="납기 지연 가능성에 대비합니다." />
                <Action number="3" title="리스크 보고서 공유" note="구매·생산 부서에 초안을 전달합니다." />
                <Button asChild className="mt-2 w-full bg-blue-600 hover:bg-blue-700"><Link href={recoHref}>대체 공급국 검토 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                <Button asChild variant="outline" className="w-full border-slate-200"><Link href={reportHref}><FileText className="mr-2 h-4 w-4" />보고서 초안 생성</Link></Button>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">요약</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">분석 공급국</span><span className="font-medium">{latestByCountry.length}개국</span></div>
                <div className="flex justify-between"><span className="text-slate-500">고위험(50+)</span><span className="font-medium text-rose-600">{ranked.filter((r) => num(r.sgri_score) >= 50).length}개국</span></div>
                <div className="flex justify-between"><span className="text-slate-500">안정(25 미만)</span><span className="font-medium text-emerald-600">{ranked.filter((r) => num(r.sgri_score) < 25).length}개국</span></div>
                <p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500"><TrendingUp className="mr-1 inline h-3.5 w-3.5 text-blue-600" /> 최고 위험국 대비 안정 공급국으로의 다변화를 권장합니다.</p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </>}
    </main>
  </div>
}

function Action({ number, title, note }: { number: string; title: string; note: string }) { return <div className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-blue-600 shadow-sm">{number}</span><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{note}</p></div></div> }
