"use client"

// 기업 추천 페이지 — 대체 공급처(추천) 화면에서 "기업 추천 보기"로 진입.
// 추천 기업을 국가별로 분류해 비교하고, '거래 기업'을 지정한다.
// 기업 데이터가 없는 국가는 Gemini가 실제 기업 후보를 자동 추천한다.

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { api, type QueryOut, type SupplierReco } from "@/lib/api"
import { getCountryName } from "@/lib/countries"
import { ArrowLeft, ArrowRight, Bell, Building2, Check, CheckCircle2, CircleAlert, Loader2, MapPin, ShieldAlert, Sparkles } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type SupplierRow = { id: number; name: string; countryCode: string; type: string; match: number; note: string; verified: boolean; isAi: boolean; unitPrice: number | null; leadDays: number | null; otd: number | null }

function mapRows(rows: SupplierReco[]): SupplierRow[] {
  return rows.map((row) => ({
    id: row.company.company_id,
    name: row.company.name,
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
}

export default function CompanyRecosPage() {
  const [queryId, setQueryId] = useState<number | null>(null)
  const [items, setItems] = useState<QueryOut[]>([])
  const [itemName, setItemName] = useState("")
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [tradingCompanyId, setTradingCompanyId] = useState<number | null>(null)
  const [savingTrading, setSavingTrading] = useState(false)
  const [focusCode, setFocusCode] = useState<string>("")   // 국가 필터(코드), ""=전체
  const [aiLoading, setAiLoading] = useState<string | null>(null)  // AI 추천 중인 국가 코드
  const [aiMsg, setAiMsg] = useState("")

  useEffect(() => {
    const url = new URLSearchParams(window.location.search)
    setFocusCode((url.get("country") ?? "").toUpperCase())
    api.getQueries().then((qs) => {
      const withHs = qs.filter((q) => q.hs_code)
      setItems(withHs)
      setQueryId(Number(url.get("query_id")) || withHs[0]?.query_id || null)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!queryId) { if (items.length) setStatus("error"); return }
    setStatus("loading"); setAiMsg("")
    Promise.all([api.getQuery(queryId), api.getSupplierRecos(queryId)])
      .then(([query, rows]) => {
        setItemName(query.item_name?.trim() || (query.hs_code ? `HS ${query.hs_code}` : "품목"))
        setTradingCompanyId(query.trading_company_id ?? null)
        setSuppliers(mapRows(rows))
        setStatus("ready")
      })
      .catch(() => setStatus("error"))
  }, [queryId, items.length])

  async function setTradingCompany(companyId: number) {
    if (!queryId || savingTrading) return
    const next = tradingCompanyId === companyId ? null : companyId
    const prev = tradingCompanyId
    setTradingCompanyId(next); setSavingTrading(true)
    try { await api.updateQuery(queryId, { trading_company_id: next }) }
    catch { setTradingCompanyId(prev) }
    finally { setSavingTrading(false) }
  }

  // 지정 국가에 대해 AI가 기업 후보를 생성해 추천에 추가
  async function runAi(code: string) {
    if (!queryId || aiLoading) return
    setAiLoading(code); setAiMsg("")
    try {
      const rows = await api.generateAiSuppliers(queryId, code)
      setSuppliers(mapRows(rows))
      setAiMsg(`${getCountryName(code) || code}의 AI 추천 기업을 불러왔습니다. (단가·리드타임 등은 AI 추정치)`)
    } catch {
      setAiMsg("AI 기업 추천에 실패했습니다. 잠시 후 다시 시도해 주세요.")
    } finally { setAiLoading(null) }
  }

  // 국가별 그룹 (국가코드 → 기업들), 기업 많은 순
  const groups = useMemo(() => {
    const m = new Map<string, SupplierRow[]>()
    suppliers.forEach((s) => { const arr = m.get(s.countryCode) ?? []; arr.push(s); m.set(s.countryCode, arr) })
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [suppliers])

  const countryCodes = groups.map(([c]) => c)
  const shown = focusCode ? groups.filter(([c]) => c === focusCode) : groups
  const focusEmpty = Boolean(focusCode && (groups.find(([c]) => c === focusCode)?.[1].length ?? 0) === 0)
  const backHref = queryId ? `/recommendations?query_id=${queryId}` : "/recommendations"

  const CompanyCard = (s: SupplierRow) => (
    <div className={`flex flex-col rounded-xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${tradingCompanyId === s.id ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200 hover:border-blue-200"}`} key={s.id}>
      <div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Building2 className="h-4 w-4" /></div>{tradingCompanyId === s.id && <Badge className="border-0 bg-blue-600 text-white hover:bg-blue-600">현재 거래 기업</Badge>}</div>{s.isAi ? <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50"><Sparkles className="mr-0.5 h-3 w-3" />AI 추정</Badge> : <Badge className="border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-50">실데이터</Badge>}</div>
      <div className="mt-3 flex items-center gap-1.5"><p className="font-semibold leading-tight">{s.name}</p>{s.verified && <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />}</div>
      <p className="mt-0.5 text-xs text-slate-500">{getCountryName(s.countryCode) || s.countryCode}{s.type && s.type !== "공급사" ? ` · ${s.type}` : ""}</p>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-slate-50 p-2.5 text-xs">
        <div className="flex justify-between"><span className="text-slate-400">적합도</span><span className="font-semibold text-emerald-600">{s.match}</span></div>
        <div className="flex justify-between"><span className="text-slate-400">예상 단가</span><span className="font-medium">{s.unitPrice != null ? `$${s.unitPrice.toLocaleString()}` : "–"}</span></div>
        <div className="flex justify-between"><span className="text-slate-400">리드타임</span><span className="font-medium">{s.leadDays != null ? `${s.leadDays}일` : "–"}</span></div>
        <div className="flex justify-between"><span className="text-slate-400">정시납품</span><span className="font-medium">{s.otd != null ? `${s.otd}%` : "–"}</span></div>
      </div>
      <p className="mt-3 min-h-10 flex-1 text-xs leading-5 text-slate-500"><span className="font-medium text-slate-600">추천 이유 · </span>{s.note || "SGRI·조달 적합도 기반 추천"}</p>
      <div className="mt-3 flex gap-2">
        <Button asChild variant="outline" size="sm" className="flex-1 border-slate-200"><Link href={`/suppliers/${s.id}${queryId ? `?query_id=${queryId}` : ""}`}>상세</Link></Button>
        <Button type="button" size="sm" onClick={() => void setTradingCompany(s.id)} disabled={savingTrading} className={`flex-1 ${tradingCompanyId === s.id ? "bg-blue-600 hover:bg-blue-700" : "bg-white text-blue-600 ring-1 ring-inset ring-blue-200 hover:bg-blue-50"}`}>{tradingCompanyId === s.id ? <><Check className="mr-1 h-3.5 w-3.5" />거래 기업</> : "거래 기업 지정"}</Button>
      </div>
    </div>
  )

  const AiButton = ({ code, has }: { code: string; has: boolean }) => (
    <Button type="button" size="sm" variant="outline" disabled={aiLoading !== null} onClick={() => runAi(code)}
      className="border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100">
      {aiLoading === code ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
      {has ? "AI로 기업 더 추천받기" : "AI 기업 추천 받기"}
    </Button>
  )

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link><div className="flex items-center gap-3"><Button asChild variant="ghost" size="icon" className="relative text-slate-600"><Link href="/alerts"><Bell className="h-4 w-4" /></Link></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div></header>
    <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 국가 추천으로 돌아가기</Link>
      <div className="mt-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-blue-600"><Sparkles className="h-4 w-4" /> 기업 추천</div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">추천 기업(공급사) — 국가별</h1>
          <p className="mt-1.5 text-sm text-slate-500">{itemName ? `${itemName} · ` : ""}국가별로 기업을 비교하고 현재 거래 기업을 지정하세요. 기업 데이터가 없는 국가는 AI가 추천합니다.</p>
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-2"><span className="text-xs font-medium text-slate-400">품목</span>
            <select value={queryId ?? ""} onChange={(e) => { setQueryId(Number(e.target.value) || null); setFocusCode("") }} className="h-10 max-w-60 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
              {items.map((it) => <option key={it.query_id} value={it.query_id}>{it.item_name ?? `HS ${it.hs_code}`}</option>)}
            </select>
          </div>
        )}
      </div>

      {aiMsg && <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{aiMsg}</div>}

      {status === "loading" ? (
        <Card className="mt-7 border-slate-200 shadow-sm"><CardContent className="flex min-h-72 flex-col items-center justify-center text-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /><p className="mt-4 text-sm font-medium text-slate-700">기업 추천을 불러오는 중입니다.</p></CardContent></Card>
      ) : status === "error" ? (
        <Card className="mt-7 border-rose-100 shadow-sm"><CardContent className="flex min-h-72 flex-col items-center justify-center text-center"><CircleAlert className="h-9 w-9 text-rose-500" /><p className="mt-4 font-semibold text-slate-800">기업 추천을 표시할 수 없습니다.</p><p className="mt-1 text-sm text-slate-500">품목을 선택하거나 분석을 먼저 완료해 주세요.</p><Button asChild className="mt-5 bg-blue-600 hover:bg-blue-700"><Link href="/items">품목 목록으로</Link></Button></CardContent></Card>
      ) : <>
        {/* 국가 필터 */}
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => setFocusCode("")} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${!focusCode ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>전체 ({suppliers.length})</button>
          {countryCodes.map((c) => { const n = groups.find(([cc]) => cc === c)?.[1].length ?? 0; return <button key={c} type="button" onClick={() => setFocusCode(c)} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${focusCode === c ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{getCountryName(c) || c} ({n})</button> })}
        </div>

        {/* 선택 국가에 기업이 없을 때: AI 추천 안내 */}
        {focusEmpty && (
          <Card className="mt-6 border-amber-200 bg-amber-50/50 shadow-sm"><CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600"><Sparkles className="h-6 w-6" /></div>
            <div><p className="font-semibold text-slate-800">{getCountryName(focusCode) || focusCode}에는 등록된 기업 데이터가 없습니다.</p><p className="mt-1 text-sm text-slate-600">대신 AI가 자동으로 판단해 실제 기업 후보를 추천해 드립니다.</p></div>
            <AiButton code={focusCode} has={false} />
          </CardContent></Card>
        )}

        {/* 국가별 그룹 */}
        {shown.map(([code, list]) => list.length === 0 ? null : (
          <Card key={code} className="mt-6 border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <div><CardTitle className="text-base"><span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-500">{code}</span>{getCountryName(code) || code}</CardTitle><CardDescription className="mt-1">기업 {list.length}곳 · 적합도·단가·리드타임으로 비교</CardDescription></div>
              <AiButton code={code} has />
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">{list.map(CompanyCard)}</CardContent>
          </Card>
        ))}

        {suppliers.length === 0 && !focusEmpty && (
          <Card className="mt-6 border-dashed border-slate-300 shadow-sm"><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><Building2 className="h-9 w-9 text-slate-300" /><p className="font-semibold text-slate-700">아직 추천 기업이 없습니다.</p><p className="text-sm text-slate-500">국가 추천에서 국가를 고른 뒤 AI로 기업을 추천받아 보세요.</p></CardContent></Card>
        )}

        <section className="mt-7 flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><MapPin className="h-4 w-4" /></div><div><p className="font-semibold">이 후보로 보고서 만들기</p><p className="mt-1 text-sm text-slate-500">선택한 국가·기업 후보를 반영해 AI 초안을 생성합니다.</p></div></div><Button asChild className="w-fit bg-blue-600 hover:bg-blue-700"><Link href={queryId ? `/reports/new?query_id=${queryId}` : "/reports/new"}>보고서 초안 만들기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></section>
      </>}
    </main>
  </div>
}
