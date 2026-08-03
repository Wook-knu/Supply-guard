"use client"

// 선택한 품목에 적합한 대체 공급국과 공급사를 비교하는 추천 화면입니다.
// 추천 점수와 사유, 공급사 목록은 백엔드 추천 API 결과만 사용합니다.

import Link from "next/link"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { COUNTRY_OPTIONS, getCountryName } from "@/lib/countries"
import { ArrowLeft, ArrowRight, Bell, Bot, Building2, Check, CheckCircle2, ChevronDown, CircleAlert, FileText, Loader2, MapPin, RefreshCw, ShieldAlert, SlidersHorizontal, Sparkles } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

// 화면이 쓰는 데이터 형태 (백엔드 응답을 여기 형태로 매핑)
type CountryRow = { recoId: number | null; rank: number; code: string; name: string; score: number; sgri: number; unitPrice: number | null; tariff: number | null; leadDays: number | null; description: string; color: string; badge: string }
type SupplierRow = { id: number; name: string; country: string; type: string; match: number; note: string; verified: boolean }

const COLORS = ["bg-emerald-50 text-emerald-700", "bg-blue-50 text-blue-700", "bg-violet-50 text-violet-700"]

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
  const [originCodes, setOriginCodes] = useState<Set<string>>(new Set())  // 현재 거래국 코드 집합
  const selectedCountry = countries.find((country) => country.name === selected) ?? countries[0]
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

    if (!id) {
      setQueryId(null)
      setDataStatus("error")
      setDataError("추천을 확인할 품목이 선택되지 않았습니다.")
      return () => { isActive = false }
    }
    setQueryId(id)

    Promise.all([api.getQuery(id), api.getCountryRecos(id), api.getSupplierRecos(id)])
      .then(([query, countryRows, supplierRows]) => {
        if (!isActive) return
        const mappedCountries: CountryRow[] = countryRows.map((row, index) => ({
          recoId: row.reco_id ?? null,
          rank: row.rank,
          code: row.country_code,
          name: getCountryName(row.country_code),
          score: Math.round(Number(row.fit_score ?? 0)),
          sgri: Math.round(Number(row.sgri_score ?? 0)),
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
        }))

        // 현재 거래국(등록 시 입력) → 국가코드 집합으로 변환해 추천 목록에서 강조
        const oc = new Set<string>()
        if (query.origin_country) query.origin_country.split(",").forEach((s) => {
          const t = s.trim()
          const m = COUNTRY_OPTIONS.find((o) => o.name === t || o.code === t.toUpperCase())
          if (t) oc.add(m?.code ?? t.toUpperCase())
        })
        setOriginCodes(oc)
        setItemName(query.item_name?.trim() || (query.hs_code ? `HS ${query.hs_code}` : "품목명 없음"))
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

  function toggleComparison(country: string) {
    setCompared((current) => current.includes(country) ? current.filter((item) => item !== country) : [...current, country])
  }

  function selectCountry(country: string) {
    setSelected(country)
    setFeedback(null)
    setFeedbackStatus("idle")
    setFeedbackError("")
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
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="relative text-slate-600"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div></header>
    <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
      {dataStatus === "loading" ? (
        <Card className="border-slate-200 shadow-sm"><CardContent className="flex min-h-80 flex-col items-center justify-center text-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /><p className="mt-4 text-sm font-medium text-slate-700">추천 데이터를 불러오는 중입니다.</p><p className="mt-1 text-xs text-slate-500">품목과 국가·공급사 추천을 확인하고 있습니다.</p></CardContent></Card>
      ) : dataStatus === "error" ? (
        <Card className="border-rose-100 shadow-sm"><CardContent className="flex min-h-80 flex-col items-center justify-center text-center"><CircleAlert className="h-9 w-9 text-rose-500" /><p className="mt-4 font-semibold text-slate-800">추천 데이터를 표시할 수 없습니다.</p><p className="mt-1 text-sm text-slate-500">{dataError}</p><div className="mt-5 flex gap-2">{queryId && <Button type="button" variant="outline" onClick={() => setReloadKey((current) => current + 1)} className="border-slate-200"><RefreshCw className="mr-2 h-4 w-4" />다시 시도</Button>}<Button asChild className="bg-blue-600 hover:bg-blue-700"><Link href="/items">품목 목록으로</Link></Button></div></CardContent></Card>
      ) : !selectedCountry || !topCountry ? (
        <Card className="border-dashed border-slate-300 shadow-sm"><CardContent className="flex min-h-80 flex-col items-center justify-center text-center"><Sparkles className="h-9 w-9 text-slate-400" /><p className="mt-4 font-semibold text-slate-800">추천 결과가 없습니다.</p><p className="mt-1 text-sm text-slate-500">품목 분석이 완료된 뒤 다시 확인해 주세요.</p><Button asChild className="mt-5 bg-blue-600 hover:bg-blue-700"><Link href="/items">품목 목록으로</Link></Button></CardContent></Card>
      ) : <>
      <Link href="/items/new" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 품목 정보 수정</Link>
      <div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><Sparkles className="h-4 w-4" /> AI 추천 결과</div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{itemLabel} 대체 공급처</h1><p className="mt-2 text-sm text-slate-500">조달 후보 <span className="font-medium text-blue-600">{countries.length}개국</span>을 SGRI 위험도 기준으로 비교했습니다.</p></div><Button asChild variant="outline" className="w-fit border-slate-200 bg-white"><Link href="/items/new"><SlidersHorizontal className="mr-2 h-4 w-4" />조건 수정</Link></Button></div>

      <Card className="mt-7 border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 shadow-sm"><CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Bot className="h-5 w-5" /></div><div className="flex-1"><p className="font-semibold">AI 요약: {topCountry ? `${topCountry.name}를 1순위로 검토하세요` : "추천 결과를 확인하세요"}</p><p className="mt-1 text-sm leading-6 text-slate-600">{topCountry ? `${itemLabel} 대체 공급국 중 ${topCountry.name}의 종합 적합도가 ${topCountry.score}점으로 가장 높습니다 (SGRI 위험도 ${topCountry.sgri}점). ${topCountry.description || "리스크·가격·물류·ESG를 종합한 결과입니다."}` : "품목을 등록하면 SGRI 기반 대체 공급국을 추천합니다."}</p></div><Badge className="w-fit border-blue-100 bg-white px-3 py-1.5 text-blue-700 hover:bg-white">{countries.length}개국 비교</Badge></CardContent></Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-3"><div className="space-y-4 xl:col-span-2"><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold">추천 국가 비교</h2><p className="mt-1 text-sm text-slate-500">적합도는 리스크·가격·물류·ESG 항목을 반영합니다.</p></div><span className="text-xs text-slate-400">비교 선택 {compared.length}개</span></div>
        {countries.map((country) => <button onClick={() => selectCountry(country.name)} key={country.name} className={`w-full rounded-xl border bg-white p-5 text-left shadow-sm transition-all ${selected === country.name ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200 hover:border-blue-200"}`}><div className="flex flex-wrap items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{country.code}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-base font-semibold">{country.rank}위 {country.name}</span><Badge className={`${country.color} border-0 hover:${country.color}`}>{country.badge}</Badge>{originCodes.has(country.code) && <Badge className="border-0 bg-blue-600 text-white hover:bg-blue-600"><MapPin className="mr-0.5 h-3 w-3" />현재 거래국</Badge>}</div><p className="mt-1 text-sm text-slate-500">{country.description}</p><div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-4"><Score label="SGRI 위험도" value={country.sgri} /><Metric label="예상 단가" value={country.unitPrice != null ? `$${country.unitPrice}` : "-"} /><Metric label="관세" value={country.tariff != null ? `${country.tariff}%` : "-"} /><Metric label="예상 리드타임" value={country.leadDays != null ? `${country.leadDays}일` : "-"} /></div></div><div className="ml-auto flex flex-col items-end gap-3"><div className="text-right"><p className="text-2xl font-semibold text-blue-600">{country.score}</p><p className="text-xs text-slate-400">종합 적합도</p></div><span onClick={(event) => { event.stopPropagation(); toggleComparison(country.name) }} className={`flex cursor-pointer items-center gap-1 text-xs font-medium ${compared.includes(country.name) ? "text-blue-600" : "text-slate-400"}`}><span className={`flex h-4 w-4 items-center justify-center rounded border ${compared.includes(country.name) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"}`}>{compared.includes(country.name) && <Check className="h-3 w-3" />}</span> 비교</span></div></div></button>)}</div>

        <aside className="space-y-6"><Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">{selectedCountry.name} 추천 근거</CardTitle><CardDescription className="mt-1">{itemLabel} 조달 기준</CardDescription></CardHeader><CardContent className="space-y-4"><Reason icon={ShieldAlert} title="공급망 위험도" text={`SGRI 위험도가 ${selectedCountry.sgri}점입니다. (낮을수록 안전)`} /><Reason icon={Sparkles} title="종합 적합도" text={`조달 조건을 반영한 적합도는 ${selectedCountry.score}점입니다.`} /><Reason icon={FileText} title="추천 근거" text={selectedCountry.description || "추천 근거가 제공되지 않았습니다."} />{suppliers[0] ? <Button asChild className="mt-1 w-full bg-blue-600 hover:bg-blue-700"><Link href={`/suppliers/${suppliers[0].id}${queryId ? `?query_id=${queryId}` : ""}`}>공급사 추천 보기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button> : <Button type="button" disabled className="mt-1 w-full">추천 공급사 없음</Button>}</CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">이 추천이 도움이 되었나요?</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-500">선택한 국가 추천에 대한 피드백을 저장합니다.</p><div className="mt-4 flex gap-2"><Button onClick={() => void saveFeedback("good")} disabled={feedbackStatus === "saving" || !selectedCountry?.recoId} variant={feedback === "good" ? "default" : "outline"} className={feedback === "good" ? "bg-blue-600 hover:bg-blue-700" : "border-slate-200"}>{feedbackStatus === "saving" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}도움 됐어요</Button><Button onClick={() => void saveFeedback("bad")} disabled={feedbackStatus === "saving" || !selectedCountry?.recoId} variant="outline" className={feedback === "bad" ? "border-rose-200 bg-rose-50 text-rose-600" : "border-slate-200"}>도움이 안 됐어요</Button></div><div aria-live="polite">{feedbackStatus === "success" && <p className="mt-3 text-xs text-blue-600">피드백이 저장되었습니다. 감사합니다.</p>}{feedbackStatus === "error" && <p role="alert" className="mt-3 flex items-start gap-1.5 text-xs text-rose-600"><CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />{feedbackError}</p>}{feedbackStatus === "idle" && !selectedCountry?.recoId && <p className="mt-3 text-xs text-amber-600">실제 추천 결과를 불러온 뒤 피드백을 저장할 수 있습니다.</p>}</div></CardContent></Card></aside>
      </div>

      <Card className="mt-7 border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4"><div><CardTitle className="text-base">추천 공급사 후보</CardTitle><CardDescription className="mt-1">공개 데이터와 조달 조건을 기반으로 한 초기 후보입니다.</CardDescription></div><Button variant="outline" size="sm" className="border-slate-200">필터 <ChevronDown className="ml-1 h-3.5 w-3.5" /></Button></CardHeader><CardContent className={suppliers.length > 0 ? "grid gap-4 md:grid-cols-3" : ""}>{suppliers.map((supplier) => <div className="rounded-xl border border-slate-200 p-4" key={supplier.id}><div className="flex items-start justify-between gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Building2 className="h-4 w-4" /></div><Badge className="border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">적합도 {supplier.match}</Badge></div><div className="mt-4 flex items-center gap-1.5"><p className="font-semibold">{supplier.name}</p>{supplier.verified && <CheckCircle2 className="h-4 w-4 text-blue-600" />}</div><p className="mt-1 text-sm text-slate-500">{supplier.country} · {supplier.type}</p><p className="mt-4 min-h-10 text-xs leading-5 text-slate-500">{supplier.note}</p><Button asChild variant="outline" size="sm" className="mt-4 w-full border-slate-200"><Link href={`/suppliers/${supplier.id}${queryId ? `?query_id=${queryId}` : ""}`}>공개 정보 보기</Link></Button></div>)}{suppliers.length === 0 && <p className="py-8 text-center text-sm text-slate-400">추천 공급사 데이터가 없습니다.</p>}</CardContent></Card>

      <section className="mt-7 flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center"><div className="flex items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><FileText className="h-4 w-4" /></div><div><p className="font-semibold">대체 공급망 대응 보고서</p><p className="mt-1 text-sm text-slate-500">선택한 국가와 공급사 후보를 반영해 AI 초안을 생성합니다.</p></div></div><Button asChild className="w-fit bg-blue-600 hover:bg-blue-700"><Link href={queryId ? `/reports/new?query_id=${queryId}` : "/reports/new"}>보고서 초안 만들기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></section>
      </>}
    </main>
  </div>
}

function Score({ label, value, good }: { label: string; value: number; good?: boolean }) { return <div><div className="mb-1 flex items-center justify-between text-xs"><span className="text-slate-500">{label}</span><span className={`font-semibold ${good ? "text-emerald-600" : "text-slate-700"}`}>{value}</span></div><Progress value={value} className="h-1.5" /></div> }
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-700">{value}</p></div> }
function Reason({ icon: Icon, title, text }: { icon: typeof ShieldAlert; title: string; text: string }) { return <div className="flex gap-3"><div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600"><Icon className="h-3.5 w-3.5" /></div><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{text}</p></div></div> }
