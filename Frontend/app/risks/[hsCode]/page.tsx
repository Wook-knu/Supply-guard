"use client"

// 품목(HS 코드)별 SGRI 리스크 상세 — /risks/{hsCode} 동적 경로.
// 실데이터: GET /risks?hs_code=… (국가별 6지표 S·C·V·L·P·E + 종합 SGRI)

import Link from "next/link"
import { use, useEffect, useMemo, useState } from "react"
import { ArrowLeft, ArrowRight, BarChart3, Bell, Bot, CheckCircle2, CircleAlert, FileText, Globe2, Loader2, RefreshCw, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { api, isUpgradeRequiredError, type ItemBenchmark, type RiskOut } from "@/lib/api"
import { getCountryName } from "@/lib/countries"
import { SgriInfo } from "@/components/sgri-info"

// HS 코드 → 품목명 (알려진 품목만; 없으면 코드 표기)
const HS_NAME: Record<string, string> = { "283691": "리튬 탄산염" }

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
  const [rows, setRows] = useState<RiskOut[]>([])
  const [loaded, setLoaded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [canReweight, setCanReweight] = useState<boolean | null>(null)
  const [reweighting, setReweighting] = useState(false)
  const [reweightMessage, setReweightMessage] = useState("")
  const [upgradeMessage, setUpgradeMessage] = useState("")
  const [recommendationQueryId, setRecommendationQueryId] = useState<number | null>(null)
  const [benchmark, setBenchmark] = useState<ItemBenchmark | null>(null)
  const [benchmarkStatus, setBenchmarkStatus] = useState<"loading" | "ready" | "empty">("loading")

  useEffect(() => {
    setLoaded(false)
    api.getRisks(hsCode)
      .then((data) => setRows(data))
      .catch(() => setRows([]))
      .finally(() => setLoaded(true))
  }, [hsCode, reloadKey])

  useEffect(() => {
    api.getSubscription()
      .then((state) => setCanReweight(state.features.reweight))
      .catch(() => setCanReweight(null))
  }, [])

  // 추천 API는 HS 코드가 아니라 사용자가 등록한 query_id를 요구하므로 현재 품목과 연결한다.
  useEffect(() => {
    api.getQueries()
      .then((queries) => setRecommendationQueryId(queries.find((query) => query.hs_code === hsCode)?.query_id ?? null))
      .catch(() => setRecommendationQueryId(null))
  }, [hsCode])

  // 품목 평균과 전체 데이터셋 평균을 비교하고, 대표 위험국의 상대 위치도 함께 조회한다.
  useEffect(() => {
    if (!loaded || rows.length === 0) return
    let active = true
    const referenceCountry = [...rows].sort((a, b) => num(b.sgri_score) - num(a.sgri_score))[0]?.country_code
    setBenchmarkStatus("loading")
    api.getItemBenchmark(hsCode, referenceCountry)
      .then((result) => {
        if (!active) return
        setBenchmark(result.error ? null : result)
        setBenchmarkStatus(result.error ? "empty" : "ready")
      })
      .catch(() => {
        if (!active) return
        setBenchmark(null)
        setBenchmarkStatus("empty")
      })
    return () => { active = false }
  }, [hsCode, loaded, rows])

  async function handleReweight() {
    if (reweighting) return
    setReweighting(true)
    setReweightMessage("")
    setUpgradeMessage("")
    try {
      const result = await api.reweightItem(hsCode)
      setReweightMessage(result.countries > 0
        ? `${result.countries}개 국가의 SGRI 가중치를 다시 계산했습니다.`
        : "재계산할 국가 위험 데이터가 없습니다.")
      setReloadKey((current) => current + 1)
    } catch (error) {
      if (isUpgradeRequiredError(error)) {
        setUpgradeMessage(error.detail)
        setCanReweight(false)
      } else {
        setReweightMessage(error instanceof Error ? error.message : "가중치를 다시 계산하지 못했습니다.")
      }
    } finally {
      setReweighting(false)
    }
  }

  const itemName = HS_NAME[hsCode] ?? `HS ${hsCode}`
  // 국가를 SGRI 높은 순으로 정렬, 최고 위험국을 대표로 사용
  const ranked = useMemo(() => [...rows].sort((a, b) => num(b.sgri_score) - num(a.sgri_score)), [rows])
  const worst = ranked[0]
  const topScore = worst ? num(worst.sgri_score) : 0
  const topLevel = levelOf(topScore)
  const recommendationHref = recommendationQueryId ? `/recommendations?query_id=${recommendationQueryId}` : "/items"
  const reportHref = recommendationQueryId ? `/reports/new?query_id=${recommendationQueryId}` : "/reports/new"

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link>
      <div className="flex items-center gap-3"><Button asChild variant="ghost" size="icon" className="relative text-slate-600"><Link href="/alerts"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Link></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div>
    </header>
    <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기</Link>
      <div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className={`mb-2 flex items-center gap-2 text-sm font-medium ${toneOf(topScore)}`}><span className={`h-2 w-2 rounded-full ${topLevel === "high" ? "bg-rose-500" : topLevel === "medium" ? "bg-amber-500" : "bg-emerald-500"}`} /> {LEVEL_LABEL[topLevel]} 모니터링</div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{itemName} 리스크 분석</h1>
          <p className="mt-2 text-sm text-slate-500">HS {hsCode} · 분석 대상 공급국 {rows.length}개국{worst ? ` · 최고 위험국 ${getCountryName(worst.country_code)}` : ""}</p>
        </div>
        <div className="flex gap-2">
          {canReweight === false ? <Button asChild variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"><Link href="/pricing"><RefreshCw className="mr-2 h-4 w-4" />가중치 재계산 · Pro</Link></Button> : <Button type="button" onClick={() => void handleReweight()} disabled={reweighting || !loaded || rows.length === 0} variant="outline" className="border-slate-200 bg-white">{reweighting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}가중치 재계산</Button>}
          <Button asChild variant="outline" className="border-slate-200 bg-white"><Link href={recommendationHref}><Globe2 className="mr-2 h-4 w-4" />대체 공급국 보기</Link></Button>
          <Button asChild className="bg-blue-600 hover:bg-blue-700"><Link href={reportHref}><FileText className="mr-2 h-4 w-4" />보고서 생성</Link></Button>
        </div>
      </div>

      {upgradeMessage && <div role="alert" className="mt-5 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-amber-900">요금제 업그레이드가 필요합니다.</p><p className="mt-1 text-sm text-amber-800">{upgradeMessage}</p></div><Button asChild className="shrink-0 bg-amber-600 hover:bg-amber-700"><Link href="/pricing">요금제 보기</Link></Button></div>}
      {reweightMessage && <div role="status" className={`mt-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${reweightMessage.includes("다시 계산했습니다") ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"}`}>{reweightMessage.includes("다시 계산했습니다") && <CheckCircle2 className="h-4 w-4" />}{reweightMessage}</div>}

      {!loaded ? <p className="mt-16 text-center text-sm text-slate-400">불러오는 중…</p>
        : rows.length === 0 ? <div className="mt-16 text-center text-sm text-slate-500">해당 품목의 위험 데이터가 없습니다.<div className="mt-3"><Button asChild variant="outline"><Link href="/dashboard">대시보드로</Link></Button></div></div>
        : <>
        <section className="mt-7 grid gap-5 lg:grid-cols-4">
          <Card className={`shadow-sm ${topLevel === "high" ? "border-rose-100 bg-gradient-to-br from-rose-50 to-white" : topLevel === "medium" ? "border-amber-100 bg-gradient-to-br from-amber-50 to-white" : "border-emerald-100 bg-gradient-to-br from-emerald-50 to-white"}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between"><span className="flex items-center gap-1 text-sm font-medium text-slate-600">최고 SGRI ({worst ? getCountryName(worst.country_code) : "-"}) <SgriInfo /></span><CircleAlert className={`h-5 w-5 ${toneOf(topScore)}`} /></div>
              <div className="mt-5 flex items-end gap-2"><span className={`text-5xl font-semibold tracking-tight ${toneOf(topScore)}`}>{topScore}</span><span className="mb-1 text-sm text-slate-400">/ 100</span></div>
              <div className="mt-4"><Badge className={`border ${topLevel === "high" ? "border-rose-100 bg-rose-100 text-rose-700 hover:bg-rose-100" : topLevel === "medium" ? "border-amber-100 bg-amber-100 text-amber-700 hover:bg-amber-100" : "border-emerald-100 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"}`}>{LEVEL_LABEL[topLevel]}</Badge></div>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">{topLevel === "high" ? "즉시 대체 공급처 검토가 권장되는 수준입니다." : topLevel === "medium" ? "주기적 모니터링과 대체 후보 확보를 권장합니다." : "현재 안정 범위이나 변동을 지켜보세요."}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm lg:col-span-3">
            <CardHeader className="pb-2"><CardTitle className="text-base">SGRI 구성 항목 — {worst ? getCountryName(worst.country_code) : ""}</CardTitle><CardDescription className="mt-1">6개 지표(공식 산출)의 최고 위험국 점수입니다.</CardDescription></CardHeader>
            <CardContent className="grid gap-x-8 gap-y-5 pt-3 sm:grid-cols-2">
              {INDICATORS.map((ind) => {
                const v = worst ? num(worst[ind.key] as string | null) : 0
                return <div key={ind.key}>
                  <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">{ind.label}</p><p className="mt-0.5 text-xs text-slate-500">{ind.note}</p></div><span className={`text-sm font-semibold ${toneOf(v)}`}>{v}</span></div>
                  <Progress value={v} className="mt-2 h-2" />
                </div>
              })}
            </CardContent>
          </Card>
        </section>

        <ItemBenchmarkCard benchmark={benchmark} status={benchmarkStatus} itemName={itemName} referenceCountryName={worst ? getCountryName(worst.country_code) : ""} />

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <Card className="border-slate-200 shadow-sm xl:col-span-2">
            <CardHeader className="pb-3"><CardTitle className="text-base">공급국 위험 순위</CardTitle><CardDescription className="mt-1">SGRI가 높은(위험한) 순서입니다.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {ranked.map((r, i) => { const s = num(r.sgri_score); const lv = levelOf(s); return <div key={r.country_code} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{i + 1}</span>
                <span className="w-10 shrink-0 text-[11px] font-bold text-slate-500">{r.country_code}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{getCountryName(r.country_code)}</span>
                <Badge className={`border text-[10px] ${lv === "high" ? "border-rose-100 bg-rose-50 text-rose-600" : lv === "medium" ? "border-amber-100 bg-amber-50 text-amber-600" : "border-emerald-100 bg-emerald-50 text-emerald-600"} hover:bg-inherit`}>{LEVEL_LABEL[lv]}</Badge>
                <span className={`w-8 text-right text-sm font-semibold ${toneOf(s)}`}>{s}</span>
              </div> })}
            </CardContent>
          </Card>
          <aside className="space-y-6">
            <Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-sm">
              <CardHeader className="pb-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white"><Bot className="h-4 w-4" /></div><CardTitle className="mt-3 text-base">지금 할 일</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Action number="1" title="저위험 공급국 견적 요청" note={`${ranked.filter((r) => levelOf(num(r.sgri_score)) === "low").length}개국이 안정 범위입니다.`} />
                <Action number="2" title="안전재고 확보 검토" note="납기 지연 가능성에 대비합니다." />
                <Action number="3" title="리스크 보고서 공유" note="구매·생산 부서에 초안을 전달합니다." />
                <Button asChild className="mt-2 w-full bg-blue-600 hover:bg-blue-700"><Link href={recommendationHref}>대체 공급처 검토 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">요약</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">분석 공급국</span><span className="font-medium">{rows.length}개국</span></div>
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

function ItemBenchmarkCard({ benchmark, status, itemName, referenceCountryName }: { benchmark: ItemBenchmark | null; status: "loading" | "ready" | "empty"; itemName: string; referenceCountryName: string }) {
  if (status === "loading") return <Card className="mt-6 border-slate-200 shadow-sm"><CardContent className="flex items-center gap-3 p-5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-blue-600" />전체 데이터셋과 상대 위치를 비교하고 있습니다.</CardContent></Card>
  if (!benchmark || status === "empty") return <Card className="mt-6 border-dashed border-slate-300 shadow-sm"><CardContent className="p-5"><p className="text-sm font-medium text-slate-700">상대 비교 데이터가 아직 충분하지 않습니다.</p><p className="mt-1 text-xs text-slate-500">다른 품목의 SGRI 데이터가 축적되면 전체 평균 대비 위치를 확인할 수 있습니다.</p></CardContent></Card>

  const itemAvg = benchmark.item_avg_sgri ?? 0
  const allAvg = benchmark.all_items_avg_sgri ?? 0
  const delta = benchmark.sgri_delta ?? 0
  const risky = delta >= 5
  const safe = delta <= -5
  const indicators = benchmark.indicators ?? []
  const strongest = [...indicators].filter((indicator) => indicator.delta > 0).sort((a, b) => b.delta - a.delta)[0]
    ?? [...indicators].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0]

  return <Card className="mt-6 overflow-hidden border-blue-100 shadow-sm">
    <CardHeader className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 pb-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-blue-600" /><CardTitle className="text-base">전체 대비 위험 위치</CardTitle></div><CardDescription className="mt-1.5">{benchmark.basis ?? "SupplyGuard SGRI 데이터 기준"} · 타사 고객정보를 사용하지 않습니다.</CardDescription></div><Badge className={`w-fit border ${risky ? "border-rose-100 bg-rose-50 text-rose-700" : safe ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"}`}>{benchmark.sgri_verdict ?? "평균 수준"}</Badge></div>
    </CardHeader>
    <CardContent className="p-5 md:p-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs text-slate-500">{itemName} 평균 SGRI</p><p className="mt-2 text-3xl font-semibold text-slate-900">{itemAvg.toFixed(1)}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">전체 품목 평균</p><p className="mt-2 text-3xl font-semibold text-slate-700">{allAvg.toFixed(1)}</p></div>
        <div className={`rounded-xl border p-4 ${risky ? "border-rose-100 bg-rose-50" : safe ? "border-emerald-100 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><p className="text-xs text-slate-500">평균과의 차이</p><p className={`mt-2 flex items-center gap-1 text-3xl font-semibold ${risky ? "text-rose-600" : safe ? "text-emerald-600" : "text-slate-700"}`}>{delta > 0 ? "+" : ""}{delta.toFixed(1)}{risky ? <TrendingUp className="h-5 w-5" /> : safe ? <TrendingDown className="h-5 w-5" /> : null}</p></div>
      </div>
      {strongest && <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">우선 확인할 항목은 <strong>{strongest.label}</strong>입니다. 전체 평균 대비 {strongest.delta > 0 ? "+" : ""}{strongest.delta.toFixed(1)}점으로 <strong>{strongest.verdict}</strong> 수준입니다.</p>}
      <div className="mt-5 grid gap-x-8 gap-y-4 md:grid-cols-2">{(benchmark.indicators ?? []).map((indicator) => <div key={indicator.key}><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="font-medium text-slate-700">{indicator.label}</span><span className={indicator.delta >= 5 ? "text-rose-600" : indicator.delta <= -5 ? "text-emerald-600" : "text-slate-500"}>{indicator.verdict} · {indicator.delta > 0 ? "+" : ""}{indicator.delta.toFixed(1)}</span></div><div className="space-y-1.5"><BenchmarkBar label="이 품목" value={indicator.item_avg} tone="bg-blue-600" /><BenchmarkBar label="전체" value={indicator.all_avg} tone="bg-slate-300" /></div></div>)}</div>
      {benchmark.country && <div className="mt-6 flex flex-col justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50 p-4 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-violet-900">{referenceCountryName}의 후보국 내 위치</p><p className="mt-1 text-xs leading-5 text-violet-800">{benchmark.country.summary} · 품목 평균 대비 {benchmark.country.vs_item_avg > 0 ? "+" : ""}{benchmark.country.vs_item_avg.toFixed(1)}점</p></div><div className="shrink-0 text-right"><p className="text-2xl font-semibold text-violet-700">상위 {benchmark.country.risk_percentile.toFixed(0)}%</p><p className="text-[11px] text-violet-600">위험도 기준</p></div></div>}
    </CardContent>
  </Card>
}

function BenchmarkBar({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className="flex items-center gap-2"><span className="w-10 shrink-0 text-[10px] text-slate-400">{label}</span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} /></div><span className="w-8 text-right text-[10px] font-medium text-slate-500">{value.toFixed(1)}</span></div> }

function Action({ number, title, note }: { number: string; title: string; note: string }) { return <div className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-blue-600 shadow-sm">{number}</span><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{note}</p></div></div> }
