"use client"

// 선택한 품목에 적합한 대체 공급국과 공급사를 비교하는 추천 화면입니다.
// 추천 점수와 사유, 공급사 목록은 백엔드 추천 API 결과만 사용합니다.

import Link from "next/link"
import { useEffect, useState } from "react"
import { api, type ItemBenchmark, type RecommendationExplanation } from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { AlertBell } from "@/components/alert-bell"
import { getCountryName } from "@/lib/countries"
import { ArrowLeft, ArrowRight, Bot, Building2, Check, CheckCircle2, CircleAlert, FileText, Info, Loader2, RefreshCw, ShieldAlert, SlidersHorizontal, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { AddToBoard } from "@/components/add-to-board"

// 화면이 쓰는 데이터 형태 (백엔드 응답을 여기 형태로 매핑)
type IndicatorKey = "score_s" | "score_c" | "score_v" | "score_l" | "score_p" | "score_e"
type CountryRow = { recoId: number | null; rank: number; code: string; name: string; score: number; sgri: number; indicators: Record<IndicatorKey, number | null>; unitPrice: number | null; tariff: number | null; leadDays: number | null; description: string; color: string; badge: string }
type SupplierRow = { id: number; name: string; country: string; type: string; match: number; note: string; verified: boolean; unitPrice: number | null; leadDays: number | null; onTime: number | null; defectRate: number | null }

const COLORS = ["bg-emerald-50 text-emerald-700", "bg-blue-50 text-blue-700", "bg-violet-50 text-violet-700"]
const INDICATORS: Array<{ key: IndicatorKey; label: string }> = [{ key: "score_s", label: "S 수급" }, { key: "score_c", label: "C 집중도" }, { key: "score_v", label: "V 가격" }, { key: "score_l", label: "L 물류" }, { key: "score_p", label: "P 정책" }, { key: "score_e", label: "E ESG" }]

export default function RecommendationsPage() {
  const [countries, setCountries] = useState<CountryRow[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [selected, setSelected] = useState("")
  const [compared, setCompared] = useState<string[]>([])
  const [feedback, setFeedback] = useState<"good" | "bad" | null>(null)
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "saving" | "success" | "error">("idle")
  const [feedbackError, setFeedbackError] = useState("")
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading")
  const [dataError, setDataError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)
  const [queryId, setQueryId] = useState<number | null>(null)
  const [itemName, setItemName] = useState("")
  const [hsCode, setHsCode] = useState("")
  const [explanation, setExplanation] = useState<RecommendationExplanation | null>(null)
  const [explanationStatus, setExplanationStatus] = useState<"idle" | "loading" | "error">("idle")
  const [countryBenchmark, setCountryBenchmark] = useState<ItemBenchmark | null>(null)
  const [countryBenchmarkStatus, setCountryBenchmarkStatus] = useState<"idle" | "loading" | "ready" | "empty">("idle")
  const selectedCountry = countries.find((country) => country.name === selected) ?? countries[0]
  const comparedCountries = countries.filter((country) => compared.includes(country.name))
  const decisionBrief = selectedCountry ? buildDecisionBrief(selectedCountry, countries) : null
  const itemLabel = itemName || "선택 품목"
  const topCountry = countries[0]

  // URL의 ?query_id= 로 품목·국가 추천·공급사 추천을 함께 불러온다.
  useEffect(() => {
    let isActive = true
    const id = Number(new URLSearchParams(window.location.search).get("query_id"))
    setDataStatus("loading")
    setDataError("")
    setCountries([])
    setSuppliers([])
    setSelected("")
    setCompared([])
    setFeedback(null)
    setFeedbackStatus("idle")
    setFeedbackError("")
    setExplanation(null)
    setExplanationStatus("idle")

    if (!id) {
      // 대시보드/공통 메뉴처럼 query_id를 전달하지 못한 진입도 최근 분석 품목으로 복구한다.
      api.getQueries()
        .then((queries) => {
          if (!isActive) return
          const latestId = queries.find((query) => query.hs_code)?.query_id
          if (!latestId) {
            setQueryId(null)
            setDataStatus("error")
            setDataError("추천을 확인할 품목이 선택되지 않았습니다.")
            return
          }
          window.history.replaceState(null, "", `/recommendations?query_id=${latestId}`)
          setReloadKey((current) => current + 1)
        })
        .catch(() => {
          if (!isActive) return
          setQueryId(null)
          setDataStatus("error")
          setDataError("최근 분석 품목을 불러오지 못했습니다. 품목 목록에서 다시 선택해 주세요.")
        })
      return () => { isActive = false }
    }
    setQueryId(id)

    Promise.all([api.getQuery(id), api.getCountryRecos(id), api.getSupplierRecos(id)])
      .then(([query, countryRows, supplierRows]) => {
        if (!isActive) return
        const mappedCountries: CountryRow[] = countryRows.map((row, index) => ({
          recoId: row.reco_id ?? row.id ?? null,
          rank: row.rank,
          code: row.country_code,
          name: getCountryName(row.country_code),
          score: Math.round(Number(row.fit_score ?? 0)),
          sgri: Math.round(Number(row.sgri_score ?? 0)),
          indicators: {
            score_s: row.score_s == null ? null : Number(row.score_s), score_c: row.score_c == null ? null : Number(row.score_c),
            score_v: row.score_v == null ? null : Number(row.score_v), score_l: row.score_l == null ? null : Number(row.score_l),
            score_p: row.score_p == null ? null : Number(row.score_p), score_e: row.score_e == null ? null : Number(row.score_e),
          },
          unitPrice: row.est_unit_price != null ? Number(row.est_unit_price) : null,
          tariff: row.tariff_percent != null ? Number(row.tariff_percent) : null,
          leadDays: row.est_lead_days,
          description: row.rationale ?? "",
          color: COLORS[index % COLORS.length],
          badge: row.rank === 1 ? "가장 추천" : `${row.rank}순위`,
        }))
        const mappedSuppliers: SupplierRow[] = supplierRows.map((row) => ({
          id: row.company.company_id,
          name: row.company.name,
          country: getCountryName(row.company.country_code ?? ""),
          type: (row.company.certifications ?? []).join(", ") || "공급사",
          match: Math.round(Number(row.fit_score ?? 0)),
          note: row.rationale ?? "",
          verified: row.company.status === "active",
          unitPrice: row.company.unit_price == null ? null : Number(row.company.unit_price),
          leadDays: row.company.lead_time_days,
          onTime: row.company.on_time_delivery_rate == null ? null : Number(row.company.on_time_delivery_rate),
          defectRate: row.company.defect_rate_pct == null ? null : Number(row.company.defect_rate_pct),
        }))

        setItemName(query.item_name?.trim() || (query.hs_code ? `HS ${query.hs_code}` : "품목명 없음"))
        setHsCode(query.hs_code ?? "")
        setCountries(mappedCountries)
        setSuppliers(mappedSuppliers)
        setSelected(mappedCountries[0]?.name ?? "")
        setCompared(mappedCountries[0] ? [mappedCountries[0].name] : [])
        setDataStatus("ready")
      })
      .catch(() => {
        if (!isActive) return
        setDataStatus("error")
        setDataError("추천 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.")
      })

    return () => { isActive = false }
  }, [reloadKey])

  useEffect(() => {
    if (!hsCode || !selectedCountry) {
      setCountryBenchmark(null)
      setCountryBenchmarkStatus("idle")
      return
    }
    let active = true
    setCountryBenchmarkStatus("loading")
    api.getItemBenchmark(hsCode, selectedCountry.code)
      .then((result) => {
        if (!active) return
        setCountryBenchmark(result.error ? null : result)
        setCountryBenchmarkStatus(result.error ? "empty" : "ready")
      })
      .catch(() => {
        if (!active) return
        setCountryBenchmark(null)
        setCountryBenchmarkStatus("empty")
      })
    return () => { active = false }
  }, [hsCode, selectedCountry])

  function toggleComparison(country: string) {
    setCompared((current) => current.includes(country) ? current.filter((item) => item !== country) : [...current, country])
  }

  function selectCountry(country: string) {
    setSelected(country)
    setFeedback(null)
    setFeedbackStatus("idle")
    setFeedbackError("")
    setExplanation(null)
    setExplanationStatus("idle")
  }

  async function loadExplanation() {
    if (!queryId || !selectedCountry) return
    setExplanationStatus("loading")
    setExplanation(null)
    try {
      setExplanation(await api.explainCountry(queryId, selectedCountry.code))
      setExplanationStatus("idle")
    } catch {
      setExplanationStatus("error")
    }
  }

  async function saveFeedback(value: "good" | "bad") {
    if (!selectedCountry?.recoId) {
      setFeedbackStatus("error")
      setFeedbackError("저장할 추천 식별자가 없습니다. 추천 데이터를 다시 불러와 주세요.")
      return
    }

    setFeedbackStatus("saving")
    setFeedbackError("")
    try {
      await api.sendFeedback({
        reco_type: "country",
        reco_id: selectedCountry.recoId,
        rating: value === "good" ? 1 : -1,
      })
      setFeedback(value)
      setFeedbackStatus("success")
    } catch {
      setFeedback(null)
      setFeedbackStatus("error")
      setFeedbackError("피드백을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.")
    }
  }

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><Link href="/dashboard" className="flex items-center gap-2.5 lg:hidden"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link><div className="flex items-center gap-3"><AlertBell /><UserAvatar /></div></header>
    <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
      {dataStatus === "loading" ? (
        <Card className="border-slate-200 shadow-sm"><CardContent className="flex min-h-80 flex-col items-center justify-center text-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /><p className="mt-4 text-sm font-medium text-slate-700">추천 데이터를 불러오는 중입니다.</p><p className="mt-1 text-xs text-slate-500">품목과 국가·공급사 추천을 확인하고 있습니다.</p></CardContent></Card>
      ) : dataStatus === "error" ? (
        <Card className="border-rose-100 shadow-sm"><CardContent className="flex min-h-80 flex-col items-center justify-center text-center"><CircleAlert className="h-9 w-9 text-rose-500" /><p className="mt-4 font-semibold text-slate-800">추천 데이터를 표시할 수 없습니다.</p><p className="mt-1 text-sm text-slate-500">{dataError}</p><div className="mt-5 flex gap-2">{queryId && <Button type="button" variant="outline" onClick={() => setReloadKey((current) => current + 1)} className="border-slate-200"><RefreshCw className="mr-2 h-4 w-4" />다시 시도</Button>}<Button asChild className="bg-blue-600 hover:bg-blue-700"><Link href="/items">품목 목록으로</Link></Button></div></CardContent></Card>
      ) : !selectedCountry || !topCountry ? (
        <Card className="border-dashed border-slate-300 shadow-sm"><CardContent className="flex min-h-80 flex-col items-center justify-center text-center"><Sparkles className="h-9 w-9 text-slate-400" /><p className="mt-4 font-semibold text-slate-800">품목 위험도 분석이 완료되지 않았습니다.</p><p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">국가별 SGRI와 대체 공급국이 산출된 뒤에만 공급사 추천을 표시합니다. 공급사 데이터만 남아 있더라도 불완전한 분석 결과이므로 화면에 노출하지 않습니다.</p><Button asChild className="mt-5 bg-blue-600 hover:bg-blue-700"><Link href="/items">품목 목록으로</Link></Button></CardContent></Card>
      ) : <>
      <Link href="/items" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 품목 목록으로</Link>
      <div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><Sparkles className="h-4 w-4" /> AI 추천 결과</div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{itemLabel} 대체 공급처</h1><p className="mt-2 text-sm text-slate-500">조달 후보 <span className="font-medium text-blue-600">{countries.length}개국</span>을 SGRI 위험도 기준으로 비교했습니다.</p></div><div className="flex gap-2"><Button asChild variant="ghost" className="text-slate-600"><Link href="/methodology"><Info className="mr-2 h-4 w-4" />SGRI란?</Link></Button><Button asChild variant="outline" className="border-slate-200 bg-white"><Link href="/items/new"><SlidersHorizontal className="mr-2 h-4 w-4" />새 조건으로 분석</Link></Button></div></div>

      <Card className="mt-7 border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 shadow-sm"><CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Bot className="h-5 w-5" /></div><div className="flex-1"><p className="font-semibold">AI 요약: {topCountry ? `${topCountry.name}를 1순위로 검토하세요` : "추천 결과를 확인하세요"}</p><p className="mt-1 text-sm leading-6 text-slate-600">{topCountry ? `${itemLabel} 대체 공급국 중 ${topCountry.name}의 종합 적합도가 ${topCountry.score}점으로 가장 높습니다 (SGRI 위험도 ${topCountry.sgri}점). ${topCountry.description || "리스크·가격·물류·ESG를 종합한 결과입니다."}` : "품목을 등록하면 SGRI 기반 대체 공급국을 추천합니다."}</p></div><Badge className="w-fit border-blue-100 bg-white px-3 py-1.5 text-blue-700 hover:bg-white">{countries.length}개국 비교</Badge></CardContent></Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-3"><div className="space-y-4 xl:col-span-2"><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold">추천 국가 비교</h2><p className="mt-1 text-sm text-slate-500">적합도는 리스크·가격·물류·ESG 항목을 반영합니다.</p></div><span className="text-xs text-slate-400">비교 선택 {compared.length}개</span></div>
        {countries.map((country) => <button onClick={() => selectCountry(country.name)} key={country.name} className={`w-full rounded-xl border bg-white p-5 text-left shadow-sm transition-all ${selected === country.name ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200 hover:border-blue-200"}`}><div className="flex flex-wrap items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{country.code}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-base font-semibold">{country.rank}위 {country.name}</span><Badge className={`${country.color} border-0 hover:${country.color}`}>{country.badge}</Badge></div><p className="mt-1 text-sm text-slate-500">{country.description}</p><div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-4"><Score label="SGRI 위험도" value={country.sgri} /><Metric label="예상 단가" value={country.unitPrice != null ? `$${country.unitPrice}` : "-"} /><Metric label="관세" value={country.tariff != null ? `${country.tariff}%` : "-"} /><Metric label="예상 리드타임" value={country.leadDays != null ? `${country.leadDays}일` : "-"} /></div></div><div className="ml-auto flex flex-col items-end gap-3"><div className="text-right"><p className="text-2xl font-semibold text-blue-600">{country.score}</p><p className="text-xs text-slate-400">종합 적합도</p></div><span onClick={(event) => { event.stopPropagation(); toggleComparison(country.name) }} className={`flex cursor-pointer items-center gap-1 text-xs font-medium ${compared.includes(country.name) ? "text-blue-600" : "text-slate-400"}`}><span className={`flex h-4 w-4 items-center justify-center rounded border ${compared.includes(country.name) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"}`}>{compared.includes(country.name) && <Check className="h-3 w-3" />}</span> 비교</span></div></div></button>)}
        {comparedCountries.length >= 2 ? <ComparisonTable countries={comparedCountries} /> : <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-4 text-center text-sm text-slate-500">국가를 2개 이상 선택하면 6개 위험지표와 조달 조건을 비교할 수 있습니다.</div>}
      </div>

        <aside className="space-y-6"><Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">{selectedCountry.name} 추천 근거</CardTitle><CardDescription className="mt-1">{itemLabel} 조달 기준</CardDescription></CardHeader><CardContent className="space-y-4"><Reason icon={ShieldAlert} title="공급망 위험도" text={`SGRI 위험도가 ${selectedCountry.sgri}점입니다. (낮을수록 안전)`} /><Reason icon={Sparkles} title="종합 적합도" text={`조달 조건을 반영한 적합도는 ${selectedCountry.score}점입니다.`} /><Reason icon={FileText} title="추천 근거" text={selectedCountry.description || "추천 근거가 제공되지 않았습니다."} /><Button type="button" variant="outline" className="w-full border-blue-200 text-blue-700" onClick={() => void loadExplanation()} disabled={explanationStatus === "loading"}>{explanationStatus === "loading" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}왜 이 국가인가요? (AI)</Button>{explanation && decisionBrief && <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4"><p className="text-sm font-semibold leading-6 text-slate-800">{decisionBrief.headline}</p><p className="mt-1 text-xs leading-5 text-slate-600">{explanation.summary}</p><div className="mt-4 space-y-3">{decisionBrief.points.map((point) => <div key={point.label} className="rounded-lg bg-white/80 p-3"><p className="text-xs font-semibold text-blue-700">{point.label}</p><p className="mt-1 text-xs leading-5 text-slate-600">{point.detail}</p></div>)}</div><div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-800">조달 담당자의 다음 행동</p><p className="mt-1 text-xs leading-5 text-amber-800">{decisionBrief.action}</p></div><p className="mt-2 text-[10px] text-slate-400">설명 출처: {explanation.source === "gemini" ? "Gemini + 후보국 비교 데이터" : "후보국 비교 데이터 기반 설명"}</p></div>}{explanationStatus === "error" && <p className="text-xs text-rose-600">AI 설명을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}<AddToBoard kind="country" title={selectedCountry.name} refCode={selectedCountry.code} memo={selectedCountry.description || undefined} queryId={queryId} className="mt-1 w-full" />{suppliers[0] ? <Button asChild className="w-full bg-blue-600 hover:bg-blue-700"><Link href={`/suppliers/${suppliers[0].id}${queryId ? `?query_id=${queryId}` : ""}`}>공급사 추천 보기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button> : <Button type="button" disabled className="w-full">추천 공급사 없음</Button>}</CardContent></Card>
          <CountryBenchmarkCard benchmark={countryBenchmark} status={countryBenchmarkStatus} countryName={selectedCountry.name} />
          <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">이 추천이 도움이 되었나요?</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-500">선택한 국가 추천에 대한 피드백을 저장합니다.</p><div className="mt-4 flex gap-2"><Button onClick={() => void saveFeedback("good")} disabled={feedbackStatus === "saving" || !selectedCountry?.recoId} variant={feedback === "good" ? "default" : "outline"} className={feedback === "good" ? "bg-blue-600 hover:bg-blue-700" : "border-slate-200"}>{feedbackStatus === "saving" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}도움 됐어요</Button><Button onClick={() => void saveFeedback("bad")} disabled={feedbackStatus === "saving" || !selectedCountry?.recoId} variant="outline" className={feedback === "bad" ? "border-rose-200 bg-rose-50 text-rose-600" : "border-slate-200"}>도움이 안 됐어요</Button></div><div aria-live="polite">{feedbackStatus === "success" && <p className="mt-3 text-xs text-blue-600">피드백이 저장되었습니다. 감사합니다.</p>}{feedbackStatus === "error" && <p role="alert" className="mt-3 flex items-start gap-1.5 text-xs text-rose-600"><CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />{feedbackError}</p>}{feedbackStatus === "idle" && !selectedCountry?.recoId && <p className="mt-3 text-xs text-amber-600">실제 추천 결과를 불러온 뒤 피드백을 저장할 수 있습니다.</p>}</div></CardContent></Card></aside>
      </div>

      <SupplierSection suppliers={suppliers} queryId={queryId} />

      <section className="mt-7 flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center"><div className="flex items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><FileText className="h-4 w-4" /></div><div><p className="font-semibold">대체 공급망 대응 보고서</p><p className="mt-1 text-sm text-slate-500">선택한 국가와 공급사 후보를 반영해 AI 초안을 생성합니다.</p></div></div><Button asChild className="w-fit bg-blue-600 hover:bg-blue-700"><Link href={queryId ? `/reports/new?query_id=${queryId}` : "/reports/new"}>보고서 초안 만들기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></section>
      </>}
    </main>
  </div>
}

function Score({ label, value, good }: { label: string; value: number; good?: boolean }) { return <div><div className="mb-1 flex items-center justify-between text-xs"><span className="text-slate-500">{label}</span><span className={`font-semibold ${good ? "text-emerald-600" : "text-slate-700"}`}>{value}</span></div><Progress value={value} className="h-1.5" /></div> }
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-700">{value}</p></div> }
function Reason({ icon: Icon, title, text }: { icon: typeof ShieldAlert; title: string; text: string }) { return <div className="flex gap-3"><div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600"><Icon className="h-3.5 w-3.5" /></div><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{text}</p></div></div> }

function CountryBenchmarkCard({ benchmark, status, countryName }: { benchmark: ItemBenchmark | null; status: "idle" | "loading" | "ready" | "empty"; countryName: string }) {
  if (status === "idle") return null
  if (status === "loading") return <Card className="border-violet-100 shadow-sm"><CardContent className="flex items-center gap-2 p-4 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-violet-600" />후보국 내 상대 위치를 계산하고 있습니다.</CardContent></Card>
  if (!benchmark?.country || status === "empty") return <Card className="border-dashed border-slate-300 shadow-sm"><CardContent className="p-4"><p className="text-sm font-medium text-slate-700">국가 상대 비교 데이터가 부족합니다.</p><p className="mt-1 text-xs leading-5 text-slate-500">후보 국가가 축적되면 위험 백분위를 표시합니다.</p></CardContent></Card>

  const country = benchmark.country
  const saferThanAverage = country.vs_item_avg < 0
  return <Card className="overflow-hidden border-violet-100 shadow-sm"><CardHeader className="bg-violet-50 pb-3"><CardTitle className="text-base">후보국 내 상대 위치</CardTitle><CardDescription>{benchmark.basis}</CardDescription></CardHeader><CardContent className="pt-5"><div className="flex items-end justify-between gap-3"><div><p className="text-sm font-medium text-slate-800">{countryName}</p><p className="mt-1 text-xs text-slate-500">후보 {country.candidate_countries}개국 중 위험도 기준</p></div><div className="text-right"><p className="text-2xl font-semibold text-violet-700">상위 {country.risk_percentile.toFixed(0)}%</p><p className="text-[10px] text-slate-400">숫자가 작을수록 고위험</p></div></div><div className="mt-4 overflow-hidden rounded-full bg-slate-100"><div className={`h-2 rounded-full ${country.risk_percentile <= 25 ? "bg-rose-500" : country.risk_percentile <= 60 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(6, 100 - country.risk_percentile)}%` }} /></div><p className={`mt-4 rounded-lg px-3 py-2.5 text-xs leading-5 ${saferThanAverage ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>품목 평균보다 {Math.abs(country.vs_item_avg).toFixed(1)}점 {saferThanAverage ? "안전합니다. 우선 검토 후보로 활용할 수 있습니다." : "위험합니다. 2순위 국가와 병행 검토하세요."}</p><p className="mt-3 text-[10px] leading-4 text-slate-400">고객사 정보가 아닌 SupplyGuard SGRI 데이터셋의 상대 위치입니다.</p></CardContent></Card>
}

function SupplierSection({ suppliers, queryId }: { suppliers: SupplierRow[]; queryId: number | null }) {
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [explanations, setExplanations] = useState<Record<number, RecommendationExplanation>>({})
  const [explanationErrors, setExplanationErrors] = useState<Record<number, string>>({})
  const [loadingId, setLoadingId] = useState<number | null>(null)
  const selected = suppliers.filter((supplier) => selectedIds.includes(supplier.id))
  function toggle(id: number) { setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  async function explain(id: number) {
    if (!queryId) return
    setLoadingId(id)
    setExplanationErrors((current) => ({ ...current, [id]: "" }))
    try {
      const result = await api.explainSupplier(queryId, id)
      setExplanations((current) => ({ ...current, [id]: result }))
    }
    catch {
      setExplanationErrors((current) => ({ ...current, [id]: "공급사 설명을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }))
    }
    finally { setLoadingId(null) }
  }
  return <Card className="mt-7 border-slate-200 shadow-sm"><CardHeader className="pb-4"><div className="flex items-center justify-between"><div><CardTitle className="text-base">추천 공급사 비교</CardTitle><CardDescription className="mt-1">두 곳 이상 선택하면 단가·납기·품질 지표를 나란히 비교합니다.</CardDescription></div><Badge className="border-blue-100 bg-blue-50 text-blue-700">선택 {selectedIds.length}</Badge></div></CardHeader><CardContent><div className={suppliers.length > 0 ? "grid gap-4 md:grid-cols-3" : ""}>{suppliers.map((supplier) => <div className={`rounded-xl border p-4 ${selectedIds.includes(supplier.id) ? "border-blue-400 ring-1 ring-blue-400" : "border-slate-200"}`} key={supplier.id}><div className="flex items-start justify-between"><Building2 className="h-5 w-5 text-slate-500" /><button type="button" onClick={() => toggle(supplier.id)} className={`flex items-center gap-1 text-xs font-medium ${selectedIds.includes(supplier.id) ? "text-blue-600" : "text-slate-400"}`}><span className={`flex h-4 w-4 items-center justify-center rounded border ${selectedIds.includes(supplier.id) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`}>{selectedIds.includes(supplier.id) && <Check className="h-3 w-3" />}</span>비교</button></div><div className="mt-3 flex items-center gap-1.5"><p className="font-semibold">{supplier.name}</p>{supplier.verified && <CheckCircle2 className="h-4 w-4 text-blue-600" />}</div><p className="mt-1 text-xs text-slate-500">{supplier.country} · 적합도 {supplier.match}</p><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Metric label="단가" value={supplier.unitPrice == null ? "-" : `$${supplier.unitPrice}`} /><Metric label="리드타임" value={supplier.leadDays == null ? "-" : `${supplier.leadDays}일`} /><Metric label="정시납품" value={supplier.onTime == null ? "-" : `${supplier.onTime}%`} /><Metric label="불량률" value={supplier.defectRate == null ? "-" : `${supplier.defectRate}%`} /></div><Button type="button" variant="outline" size="sm" className="mt-4 w-full border-blue-200 text-blue-700" disabled={!queryId || loadingId === supplier.id} onClick={() => void explain(supplier.id)}>{loadingId === supplier.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}왜 이 공급사인가요?</Button>{explanations[supplier.id] && <div className="mt-3 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-slate-600"><p className="font-medium text-slate-800">{explanations[supplier.id].summary}</p><p className="mt-2">{explanations[supplier.id].recommendation}</p></div>}{explanationErrors[supplier.id] && <p role="alert" className="mt-3 text-xs leading-5 text-rose-600">{explanationErrors[supplier.id]}</p>}<div className="mt-3 grid gap-2"><AddToBoard kind="company" title={supplier.name} refCode={String(supplier.id)} memo={supplier.note || undefined} queryId={queryId} className="w-full" label="보드에 추가" /><Button asChild variant="outline" size="sm"><Link href={`/suppliers/${supplier.id}${queryId ? `?query_id=${queryId}` : ""}`}>상세 정보</Link></Button></div></div>)}{suppliers.length === 0 && <p className="py-8 text-center text-sm text-slate-400">추천 공급사 데이터가 없습니다.</p>}</div>{selected.length >= 2 && <div className="mt-5 overflow-x-auto rounded-xl border border-blue-100"><table className="w-full min-w-[560px] text-sm"><thead><tr className="bg-blue-50"><th className="px-4 py-3 text-left">항목</th>{selected.map((supplier) => <th key={supplier.id} className="px-4 py-3 text-right">{supplier.name}</th>)}</tr></thead><tbody>{[["적합도", (s: SupplierRow) => `${s.match}점`], ["단가", (s: SupplierRow) => s.unitPrice == null ? "-" : `$${s.unitPrice}`], ["리드타임", (s: SupplierRow) => s.leadDays == null ? "-" : `${s.leadDays}일`], ["정시납품률", (s: SupplierRow) => s.onTime == null ? "-" : `${s.onTime}%`], ["불량률", (s: SupplierRow) => s.defectRate == null ? "-" : `${s.defectRate}%`]].map(([label, value]) => <tr key={String(label)} className="border-t border-slate-100"><td className="px-4 py-3 text-slate-500">{String(label)}</td>{selected.map((supplier) => <td key={supplier.id} className="px-4 py-3 text-right font-medium">{(value as (s: SupplierRow) => string)(supplier)}</td>)}</tr>)}</tbody></table></div>}</CardContent></Card>
}

function ComparisonTable({ countries }: { countries: CountryRow[] }) {
  const rows = [
    ...INDICATORS.map(({ key, label }) => ({ label, value: (country: CountryRow) => country.indicators[key] == null ? "-" : country.indicators[key]!.toFixed(1) })),
    { label: "SGRI 종합", value: (country: CountryRow) => country.sgri.toFixed(0) },
    { label: "예상 단가", value: (country: CountryRow) => country.unitPrice == null ? "-" : `$${country.unitPrice}` },
    { label: "관세", value: (country: CountryRow) => country.tariff == null ? "-" : `${country.tariff}%` },
    { label: "리드타임", value: (country: CountryRow) => country.leadDays == null ? "-" : `${country.leadDays}일` },
  ]
  return <Card className="overflow-hidden border-blue-100 shadow-sm"><CardHeader className="bg-blue-50/60 pb-3"><CardTitle className="text-base">선택 국가 상세 비교</CardTitle><CardDescription>위험지표는 0점에 가까울수록 안정적입니다.</CardDescription></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b border-slate-200 bg-white"><th className="px-4 py-3 text-left font-medium text-slate-500">평가 항목</th>{countries.map((country) => <th key={country.code} className="px-4 py-3 text-right font-semibold text-slate-800">{country.name}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.label} className="border-b border-slate-100 last:border-0"><td className="px-4 py-3 text-slate-500">{row.label}</td>{countries.map((country) => <td key={country.code} className="px-4 py-3 text-right font-medium text-slate-700">{row.value(country)}</td>)}</tr>)}</tbody></table></CardContent></Card>
}

function buildDecisionBrief(country: CountryRow, countries: CountryRow[]) {
  const average = countries.reduce((sum, item) => sum + item.sgri, 0) / Math.max(countries.length, 1)
  const nextCountry = countries.find((item) => item.rank === country.rank + 1)
  const indicatorNames: Record<IndicatorKey, string> = {
    score_s: "수급 불안정성", score_c: "공급처 집중도", score_v: "가격 변동성",
    score_l: "물류 리스크", score_p: "국가·정책 리스크", score_e: "ESG·탄소규제",
  }
  const values = INDICATORS
    .map(({ key }) => ({ key, label: indicatorNames[key], value: country.indicators[key] }))
    .filter((item): item is { key: IndicatorKey; label: string; value: number } => item.value != null)
  const strengths = values.filter((item) => item.value < 25).sort((a, b) => a.value - b.value)
  const cautions = values.filter((item) => item.value >= 50).sort((a, b) => b.value - a.value)
  const missing = [country.unitPrice == null ? "예상 단가" : null, country.tariff == null ? "관세" : null, country.leadDays == null ? "리드타임" : null].filter(Boolean)
  const averageGap = average - country.sgri
  const runnerUpText = nextCountry ? ` ${nextCountry.rank}위 ${nextCountry.name}보다도 SGRI가 ${Math.abs(nextCountry.sgri - country.sgri).toFixed(1)}점 낮습니다.` : ""
  const strengthText = strengths.length
    ? strengths.slice(0, 3).map((item) => `${item.label} ${item.value.toFixed(1)}점`).join(", ") + "이 종합 위험을 낮춘 핵심 요인입니다."
    : "25점 미만의 뚜렷한 저위험 지표는 없어 세부 검증이 필요합니다."
  const cautionText = cautions.length
    ? cautions.slice(0, 2).map((item) => `${item.label} ${item.value.toFixed(1)}점`).join(", ") + "은 후보 선정 후에도 별도로 관리해야 합니다."
    : "50점 이상인 고위험 지표가 없어 지표 구성은 비교적 안정적입니다."
  const commercialText = missing.length
    ? `${missing.join("·")} 데이터가 아직 없습니다. 현재 ${country.rank}위는 위험지표 기준 순위이며 실제 구매 우위가 확정된 것은 아닙니다.`
    : `예상 단가 $${country.unitPrice}, 관세 ${country.tariff}%, 리드타임 ${country.leadDays}일까지 함께 확인된 결과입니다.`
  const action = cautions.some((item) => item.key === "score_c")
    ? `공급처 집중도 위험이 높으므로 ${country.name} 한 곳으로 즉시 전환하지 말고, 현지 공급사 2곳 이상에 동일 조건으로 견적을 요청하세요. ${missing.length ? `${missing.join("·")}와 MOQ·인코텀즈를 확인한 뒤 ` : ""}${nextCountry ? `${nextCountry.rank}위 ${nextCountry.name}를 보조 공급국으로 병행 비교하는 것이 안전합니다.` : "보조 공급국도 함께 확보하는 것이 안전합니다."}`
    : `${missing.length ? `${missing.join("·")}와 MOQ·인코텀즈를 먼저 확인하고, ` : ""}샘플 품질과 납기 조건을 검증한 뒤 소규모 발주로 공급 안정성을 확인하세요.`

  return {
    headline: `${countries.length}개 후보국 중 ${country.rank}위 · 후보 평균보다 SGRI ${Math.abs(averageGap).toFixed(1)}점 ${averageGap >= 0 ? "낮음" : "높음"}`,
    points: [
      { label: "왜 상위권인가", detail: `SGRI ${country.sgri.toFixed(1)}점으로 후보국 평균 ${average.toFixed(1)}점보다 ${Math.abs(averageGap).toFixed(1)}점 낮습니다.${runnerUpText}` },
      { label: "점수를 낮춘 요인", detail: strengthText },
      { label: "남아 있는 핵심 위험", detail: cautionText },
      { label: "현재 판단의 한계", detail: commercialText },
    ],
    action,
  }
}
