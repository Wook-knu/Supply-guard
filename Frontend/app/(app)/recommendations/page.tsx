"use client"

// 선택한 품목에 적합한 대체 공급국과 공급사를 비교하는 추천 화면입니다.
// 추천 점수와 사유, 공급사 목록은 백엔드 추천 API 결과만 사용합니다.

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { api, type QueryOut } from "@/lib/api"
import { COUNTRY_OPTIONS, getCountryName } from "@/lib/countries"
import { ArrowLeft, ArrowRight, Bell, Bot, Building2, Check, CircleAlert, FileText, GitCompareArrows, Loader2, MapPin, RefreshCw, ShieldAlert, SlidersHorizontal, Sparkles } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

// 화면이 쓰는 데이터 형태 (백엔드 응답을 여기 형태로 매핑)
type CountryRow = { recoId: number | null; rank: number; code: string; name: string; score: number; sgri: number; unitPrice: number | null; tariff: number | null; leadDays: number | null; description: string; color: string; badge: string }
type SupplierRow = { id: number; name: string; country: string; countryCode: string; type: string; match: number; note: string; verified: boolean; isAi: boolean; unitPrice: number | null; leadDays: number | null; otd: number | null }

const COLORS = ["bg-emerald-50 text-emerald-700", "bg-blue-50 text-blue-700", "bg-violet-50 text-violet-700"]

export default function RecommendationsPage() {
  const [countries, setCountries] = useState<CountryRow[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const router = useRouter()
  const [selected, setSelected] = useState("")
  const [compareMode, setCompareMode] = useState(false)      // 두 국가 비교 선택 모드
  const [comparePicks, setComparePicks] = useState<string[]>([])  // 선택된 국가 코드(최대 2)
  const [feedback, setFeedback] = useState<"good" | "bad" | null>(null)
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "saving" | "success" | "error">("idle")
  const [feedbackError, setFeedbackError] = useState("")
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading")
  const [dataError, setDataError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)
  const [queryId, setQueryId] = useState<number | null>(null)
  const [items, setItems] = useState<QueryOut[]>([])
  const [itemName, setItemName] = useState("")

  // 내 품목 목록 로드 + 기본 선택(URL query_id 있으면 그것, 없으면 첫 품목)
  useEffect(() => {
    api.getQueries().then((qs) => {
      const withHs = qs.filter((q) => q.hs_code)
      setItems(withHs)
      const urlId = Number(new URLSearchParams(window.location.search).get("query_id"))
      setQueryId(urlId || withHs[0]?.query_id || null)
    }).catch(() => {})
  }, [])
  const [originCodes, setOriginCodes] = useState<Set<string>>(new Set())    // 등록한 국가(관심+거래중) 코드 집합
  const [tradingCodes, setTradingCodes] = useState<Set<string>>(new Set())  // 그중 현재 거래중 코드 집합
  const [savingCountry, setSavingCountry] = useState(false)
  const selectedCountry = countries.find((country) => country.name === selected) ?? countries[0]
  const itemLabel = itemName || "선택 품목"
  const topCountry = countries[0]

  // 선택된 품목(queryId)의 국가·기업 추천을 불러온다.
  useEffect(() => {
    let isActive = true
    const id = queryId
    setDataStatus("loading")
    setDataError("")
    setCountries([])
    setSuppliers([])
    setSelected("")
    setCompareMode(false)
    setComparePicks([])
    setFeedback(null)
    setFeedbackStatus("idle")
    setFeedbackError("")

    if (!id) {
      setDataStatus("error")
      setDataError(items.length > 0 ? "위에서 품목을 선택해 주세요." : "등록된 품목이 없습니다. 먼저 품목을 등록해 주세요.")
      return () => { isActive = false }
    }

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
          countryCode: (row.company.country_code ?? "").toUpperCase(),
          type: (row.company.certifications ?? []).join(", ") || "공급사",
          match: Math.round(Number(row.fit_score ?? 0)),
          note: row.rationale ?? "",
          verified: row.company.status === "active",
          isAi: (row.company.data_source ?? "").startsWith("ai:"),
          unitPrice: row.company.unit_price != null ? Number(row.company.unit_price) : (row.est_unit_price != null ? Number(row.est_unit_price) : null),
          leadDays: row.company.lead_time_days ?? row.est_lead_days ?? null,
          otd: row.company.on_time_delivery_rate != null ? Number(row.company.on_time_delivery_rate) : null,
        }))

        // 등록 국가/거래중 국가(콤마 국가명) → 코드 집합으로 변환
        const toSet = (raw: string | undefined) => {
          const s = new Set<string>()
          ;(raw ?? "").split(",").forEach((x) => {
            const t = x.trim()
            if (!t) return
            const m = COUNTRY_OPTIONS.find((o) => o.name === t || o.code === t.toUpperCase())
            s.add(m?.code ?? t.toUpperCase())
          })
          return s
        }
        setOriginCodes(toSet(query.origin_country))
        setTradingCodes(toSet(query.trading_country))
        setItemName(query.item_name?.trim() || (query.hs_code ? `HS ${query.hs_code}` : "품목명 없음"))
        setCountries(mappedCountries)
        setSuppliers(mappedSuppliers)
        setSelected(mappedCountries[0]?.name ?? "")
        setDataStatus("ready")
      })
      .catch(() => {
        if (!isActive) return
        setDataStatus("error")
        setDataError("추천 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.")
      })

    return () => { isActive = false }
  }, [queryId, reloadKey])

  // 비교 대상 국가 선택(코드). 최대 2개 — 2개 찬 상태에서 새로 누르면 가장 오래된 것을 밀어낸다.
  function togglePick(code: string) {
    setComparePicks((cur) => cur.includes(code) ? cur.filter((c) => c !== code) : cur.length < 2 ? [...cur, code] : [cur[1], code])
  }
  const selectedHs = items.find((i) => i.query_id === queryId)?.hs_code ?? ""
  function goCompare() {
    if (comparePicks.length !== 2) return
    router.push(`/compare?hs=${selectedHs}&a=${comparePicks[0]}&b=${comparePicks[1]}`)
  }

  // 국가를 등록안함/관심(등록)/거래중 상태로 지정하고 서버에 저장.
  async function setCountryStatus(code: string, next: "none" | "registered" | "trading") {
    if (!queryId || savingCountry) return
    const origin = new Set(originCodes)
    const trading = new Set(tradingCodes)
    if (next === "none") { origin.delete(code); trading.delete(code) }
    else if (next === "registered") { origin.add(code); trading.delete(code) }
    else { origin.add(code); trading.add(code) }  // 거래중은 등록에도 포함
    const prevO = originCodes, prevT = tradingCodes
    setOriginCodes(origin); setTradingCodes(trading)  // 낙관적
    setSavingCountry(true)
    const toNames = (s: Set<string>) => [...s].map((c) => getCountryName(c) || c).join(",")
    try {
      await api.updateQuery(queryId, { origin_country: toNames(origin), trading_country: toNames(trading) })
    } catch {
      setOriginCodes(prevO); setTradingCodes(prevT)  // 롤백
    } finally { setSavingCountry(false) }
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
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-blue-600"><Sparkles className="h-4 w-4" /> AI 추천 결과</div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">대체 국가·기업 추천</h1>
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400">품목</span>
            <select value={queryId ?? ""} onChange={(e) => setQueryId(Number(e.target.value) || null)} className="h-10 max-w-60 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
              {items.map((it) => <option key={it.query_id} value={it.query_id}>{it.item_name ?? `HS ${it.hs_code}`}</option>)}
            </select>
          </div>
        )}
      </div>
      {dataStatus === "loading" ? (
        <Card className="border-slate-200 shadow-sm"><CardContent className="flex min-h-80 flex-col items-center justify-center text-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /><p className="mt-4 text-sm font-medium text-slate-700">추천 데이터를 불러오는 중입니다.</p><p className="mt-1 text-xs text-slate-500">품목과 국가·공급사 추천을 확인하고 있습니다.</p></CardContent></Card>
      ) : dataStatus === "error" ? (
        <Card className="border-rose-100 shadow-sm"><CardContent className="flex min-h-80 flex-col items-center justify-center text-center"><CircleAlert className="h-9 w-9 text-rose-500" /><p className="mt-4 font-semibold text-slate-800">추천 데이터를 표시할 수 없습니다.</p><p className="mt-1 text-sm text-slate-500">{dataError}</p><div className="mt-5 flex gap-2">{queryId && <Button type="button" variant="outline" onClick={() => setReloadKey((current) => current + 1)} className="border-slate-200"><RefreshCw className="mr-2 h-4 w-4" />다시 시도</Button>}<Button asChild className="bg-blue-600 hover:bg-blue-700"><Link href="/items">품목 목록으로</Link></Button></div></CardContent></Card>
      ) : !selectedCountry || !topCountry ? (
        <Card className="border-dashed border-slate-300 shadow-sm"><CardContent className="flex min-h-80 flex-col items-center justify-center text-center"><Sparkles className="h-9 w-9 text-slate-400" /><p className="mt-4 font-semibold text-slate-800">추천 결과가 없습니다.</p><p className="mt-1 text-sm text-slate-500">품목 분석이 완료된 뒤 다시 확인해 주세요.</p><Button asChild className="mt-5 bg-blue-600 hover:bg-blue-700"><Link href="/items">품목 목록으로</Link></Button></CardContent></Card>
      ) : <>
      <Link href="/items/new" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 품목 정보 수정</Link>
      <div className="mt-2 flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><h2 className="text-lg font-semibold">{itemLabel}</h2><p className="mt-1 text-sm text-slate-500">조달 후보 <span className="font-medium text-blue-600">{countries.length}개국</span>을 SGRI 위험도 기준으로 비교했습니다.</p></div><Button asChild variant="outline" className="w-fit border-slate-200 bg-white"><Link href="/items/new"><SlidersHorizontal className="mr-2 h-4 w-4" />조건 수정</Link></Button></div>

      <Card className="mt-7 border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 shadow-sm"><CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Bot className="h-5 w-5" /></div><div className="flex-1"><p className="font-semibold">AI 요약: {topCountry ? `${topCountry.name}를 1순위로 검토하세요` : "추천 결과를 확인하세요"}</p><p className="mt-1 text-sm leading-6 text-slate-600">{topCountry ? `${itemLabel} 대체 공급국 중 ${topCountry.name}의 종합 적합도가 ${topCountry.score}점으로 가장 높습니다 (SGRI 위험도 ${topCountry.sgri}점). ${topCountry.description || "리스크·가격·물류·ESG를 종합한 결과입니다."}` : "품목을 등록하면 SGRI 기반 대체 공급국을 추천합니다."}</p></div><Badge className="w-fit border-blue-100 bg-white px-3 py-1.5 text-blue-700 hover:bg-white">{countries.length}개국 비교</Badge></CardContent></Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-3"><div className="space-y-4 xl:col-span-2"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-base font-semibold">추천 국가 비교</h2><p className="mt-1 text-sm text-slate-500">{compareMode ? "비교할 국가 2곳을 카드에서 선택하세요." : <>각 국가를 <span className="font-medium text-blue-600">거래중</span>·<span className="font-medium text-amber-600">관심</span>으로 등록하면 대시보드·내 품목 SGRI에 반영됩니다.</>}</p></div>
          <div className="flex items-center gap-2">
            {compareMode && comparePicks.length === 2 && <Button size="sm" onClick={goCompare} className="bg-blue-600 hover:bg-blue-700">선택 2개국 비교 <ArrowRight className="ml-1.5 h-4 w-4" /></Button>}
            <Button size="sm" variant={compareMode ? "default" : "outline"} onClick={() => { setCompareMode((m) => !m); setComparePicks([]) }} className={compareMode ? "bg-slate-700 hover:bg-slate-800" : "border-slate-200"}><GitCompareArrows className="mr-1.5 h-4 w-4" />{compareMode ? `비교 취소 (${comparePicks.length}/2)` : "국가 비교"}</Button>
          </div>
        </div>
        {countries.map((country) => { const picked = comparePicks.includes(country.code); const pickIndex = comparePicks.indexOf(country.code); return <button onClick={() => compareMode ? togglePick(country.code) : selectCountry(country.name)} key={country.name} className={`w-full rounded-xl border bg-white p-5 text-left shadow-sm transition-all duration-200 active:scale-[0.99] ${compareMode ? (picked ? "border-blue-500 ring-2 ring-blue-400" : "border-slate-200 hover:border-blue-300") : selected === country.name ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"}`}><div className="flex flex-wrap items-start gap-4"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold ${compareMode && picked ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>{compareMode && picked ? pickIndex + 1 : country.code}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-base font-semibold">{country.rank}위 {country.name}</span><Badge className={`${country.color} border-0 hover:${country.color}`}>{country.badge}</Badge>{tradingCodes.has(country.code) ? <Badge className="border-0 bg-blue-600 text-white hover:bg-blue-600"><MapPin className="mr-0.5 h-3 w-3" />현재 거래국</Badge> : originCodes.has(country.code) ? <Badge className="border-0 bg-emerald-600 text-white hover:bg-emerald-600">관심 등록</Badge> : null}
                {!compareMode && <span className="inline-flex overflow-hidden rounded-full border border-slate-200" onClick={(e) => e.stopPropagation()}>
                  {(() => { const cur = tradingCodes.has(country.code) ? "trading" : originCodes.has(country.code) ? "registered" : "none"
                    const styles = { trading: { active: "bg-blue-600 text-white", idle: "text-blue-600 hover:bg-blue-50" }, registered: { active: "bg-emerald-600 text-white", idle: "text-emerald-600 hover:bg-emerald-50" }, none: { active: "bg-rose-500 text-white", idle: "text-rose-500 hover:bg-rose-50" } }
                    return ([["trading", "거래중"], ["registered", "관심"], ["none", "해제"]] as const).map(([key, label], i) => (
                      <button key={key} type="button" disabled={savingCountry} onClick={() => setCountryStatus(country.code, key)}
                        className={`px-3 py-1.5 text-xs font-semibold transition-colors ${i > 0 ? "border-l border-slate-200" : ""} ${cur === key ? styles[key].active : `bg-white ${styles[key].idle}`}`}>{label}</button>
                    )) })()}
                </span>}</div><p className="mt-1 text-sm text-slate-500">{country.description}</p><div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-4"><Score label="SGRI 위험도" value={country.sgri} /><Metric label="예상 단가" value={country.unitPrice != null ? `$${country.unitPrice}` : "-"} /><Metric label="관세" value={country.tariff != null ? `${country.tariff}%` : "-"} /><Metric label="예상 리드타임" value={country.leadDays != null ? `${country.leadDays}일` : "-"} /></div></div><div className="ml-auto flex flex-col items-end gap-3"><div className="text-right"><p className="text-2xl font-semibold text-blue-600">{country.score}</p><p className="text-xs text-slate-400">종합 적합도</p></div>{compareMode && <span className={`flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold ${picked ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"}`}>{picked ? <><Check className="h-3.5 w-3.5" />비교 {pickIndex + 1}</> : "비교 선택"}</span>}</div></div></button> })}</div>

        <aside className="space-y-6"><Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">{selectedCountry.name} 추천 근거</CardTitle><CardDescription className="mt-1">{itemLabel} 조달 기준</CardDescription></CardHeader><CardContent className="space-y-4"><Reason icon={ShieldAlert} title="공급망 위험도" text={`SGRI 위험도가 ${selectedCountry.sgri}점입니다. (낮을수록 안전)`} /><Reason icon={Sparkles} title="종합 적합도" text={`조달 조건을 반영한 적합도는 ${selectedCountry.score}점입니다.`} /><Reason icon={FileText} title="추천 근거" text={selectedCountry.description || "추천 근거가 제공되지 않았습니다."} /><Button asChild className="mt-1 w-full bg-blue-600 hover:bg-blue-700"><Link href={queryId ? `/recommendations/companies?query_id=${queryId}&country=${selectedCountry.code}` : "/recommendations/companies"}>{selectedCountry.name} 기업 추천 ({suppliers.filter((s) => s.countryCode === selectedCountry.code).length}) <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">이 추천이 도움이 되었나요?</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-500">선택한 국가 추천에 대한 피드백을 저장합니다.</p><div className="mt-4 flex gap-2"><Button onClick={() => void saveFeedback("good")} disabled={feedbackStatus === "saving" || !selectedCountry?.recoId} variant={feedback === "good" ? "default" : "outline"} className={feedback === "good" ? "bg-blue-600 hover:bg-blue-700" : "border-slate-200"}>{feedbackStatus === "saving" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}도움 됐어요</Button><Button onClick={() => void saveFeedback("bad")} disabled={feedbackStatus === "saving" || !selectedCountry?.recoId} variant="outline" className={feedback === "bad" ? "border-rose-200 bg-rose-50 text-rose-600" : "border-slate-200"}>도움이 안 됐어요</Button></div><div aria-live="polite">{feedbackStatus === "success" && <p className="mt-3 text-xs text-blue-600">피드백이 저장되었습니다. 감사합니다.</p>}{feedbackStatus === "error" && <p role="alert" className="mt-3 flex items-start gap-1.5 text-xs text-rose-600"><CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />{feedbackError}</p>}{feedbackStatus === "idle" && !selectedCountry?.recoId && <p className="mt-3 text-xs text-amber-600">실제 추천 결과를 불러온 뒤 피드백을 저장할 수 있습니다.</p>}</div></CardContent></Card></aside>
      </div>

      <section className="mt-7 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center"><div className="flex items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Building2 className="h-4 w-4" /></div><div><p className="font-semibold">추천 기업 보기</p><p className="mt-1 text-sm text-slate-500">공급사 후보 비교·거래 기업 지정</p></div></div><Button asChild variant="outline" className="w-fit border-slate-200" disabled={suppliers.length === 0}><Link href={queryId ? `/recommendations/companies?query_id=${queryId}` : "/recommendations/companies"}>기업 추천 {suppliers.length > 0 ? `(${suppliers.length})` : ""} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div>
        <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center"><div className="flex items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><FileText className="h-4 w-4" /></div><div><p className="font-semibold">대응 보고서</p><p className="mt-1 text-sm text-slate-500">선택 국가·기업 반영 AI 초안</p></div></div><Button asChild className="w-fit bg-blue-600 hover:bg-blue-700"><Link href={queryId ? `/reports/new?query_id=${queryId}` : "/reports/new"}>보고서 초안 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div>
      </section>
      </>}
    </main>
  </div>
}

function Score({ label, value, good }: { label: string; value: number; good?: boolean }) { return <div><div className="mb-1 flex items-center justify-between text-xs"><span className="text-slate-500">{label}</span><span className={`font-semibold ${good ? "text-emerald-600" : "text-slate-700"}`}>{value}</span></div><Progress value={value} className="h-1.5" /></div> }
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-700">{value}</p></div> }
function Reason({ icon: Icon, title, text }: { icon: typeof ShieldAlert; title: string; text: string }) { return <div className="flex gap-3"><div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600"><Icon className="h-3.5 w-3.5" /></div><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{text}</p></div></div> }
