"use client"

// 기업 추천 페이지 — 대체 공급처(추천) 화면에서 "기업 추천 보기"로 진입.
// 선택 품목의 추천 기업(공급사)을 카드로 비교하고, '거래 기업'을 지정한다.

import Link from "next/link"
import { useEffect, useState } from "react"
import { api, type QueryOut } from "@/lib/api"
import { getCountryName } from "@/lib/countries"
import { ArrowLeft, ArrowRight, Bell, Building2, Check, CheckCircle2, CircleAlert, Loader2, ShieldAlert, Sparkles } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type SupplierRow = { id: number; name: string; country: string; type: string; match: number; note: string; verified: boolean; isAi: boolean; unitPrice: number | null; leadDays: number | null; otd: number | null }

export default function CompanyRecosPage() {
  const [queryId, setQueryId] = useState<number | null>(null)
  const [items, setItems] = useState<QueryOut[]>([])
  const [itemName, setItemName] = useState("")
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [tradingCompanyId, setTradingCompanyId] = useState<number | null>(null)
  const [savingTrading, setSavingTrading] = useState(false)

  // 품목 목록 + 기본 선택(URL query_id 우선)
  useEffect(() => {
    api.getQueries().then((qs) => {
      const withHs = qs.filter((q) => q.hs_code)
      setItems(withHs)
      const urlId = Number(new URLSearchParams(window.location.search).get("query_id"))
      setQueryId(urlId || withHs[0]?.query_id || null)
    }).catch(() => {})
  }, [])

  // 선택 품목의 기업 추천 로드
  useEffect(() => {
    if (!queryId) { if (items.length) setStatus("error"); return }
    setStatus("loading")
    Promise.all([api.getQuery(queryId), api.getSupplierRecos(queryId)])
      .then(([query, rows]) => {
        setItemName(query.item_name?.trim() || (query.hs_code ? `HS ${query.hs_code}` : "품목"))
        setTradingCompanyId(query.trading_company_id ?? null)
        setSuppliers(rows.map((row) => ({
          id: row.company.company_id,
          name: row.company.name,
          country: getCountryName(row.company.country_code ?? ""),
          type: (row.company.certifications ?? []).join(", ") || "공급사",
          match: Math.round(Number(row.fit_score ?? 0)),
          note: row.rationale ?? "",
          verified: row.company.status === "active",
          isAi: (row.company.data_source ?? "").startsWith("ai:"),
          unitPrice: row.company.unit_price != null ? Number(row.company.unit_price) : (row.est_unit_price != null ? Number(row.est_unit_price) : null),
          leadDays: row.company.lead_time_days ?? row.est_lead_days ?? null,
          otd: row.company.on_time_delivery_rate != null ? Number(row.company.on_time_delivery_rate) : null,
        })))
        setStatus("ready")
      })
      .catch(() => setStatus("error"))
  }, [queryId, items.length])

  // 현재 거래 기업 지정/해제 (같은 기업 다시 누르면 해제)
  async function setTradingCompany(companyId: number) {
    if (!queryId || savingTrading) return
    const next = tradingCompanyId === companyId ? null : companyId
    const prev = tradingCompanyId
    setTradingCompanyId(next)
    setSavingTrading(true)
    try { await api.updateQuery(queryId, { trading_company_id: next }) }
    catch { setTradingCompanyId(prev) }
    finally { setSavingTrading(false) }
  }

  const backHref = queryId ? `/recommendations?query_id=${queryId}` : "/recommendations"

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link><div className="flex items-center gap-3"><Button asChild variant="ghost" size="icon" className="relative text-slate-600"><Link href="/alerts"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Link></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div></header>
    <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 국가 추천으로 돌아가기</Link>
      <div className="mt-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-blue-600"><Sparkles className="h-4 w-4" /> 기업 추천</div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">추천 기업(공급사) 비교</h1>
          <p className="mt-1.5 text-sm text-slate-500">{itemName ? `${itemName} · ` : ""}적합도·단가·리드타임·정시납품으로 비교하고, 현재 거래 중인 기업을 지정하세요.</p>
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-2"><span className="text-xs font-medium text-slate-400">품목</span>
            <select value={queryId ?? ""} onChange={(e) => setQueryId(Number(e.target.value) || null)} className="h-10 max-w-60 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
              {items.map((it) => <option key={it.query_id} value={it.query_id}>{it.item_name ?? `HS ${it.hs_code}`}</option>)}
            </select>
          </div>
        )}
      </div>

      {status === "loading" ? (
        <Card className="mt-7 border-slate-200 shadow-sm"><CardContent className="flex min-h-72 flex-col items-center justify-center text-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /><p className="mt-4 text-sm font-medium text-slate-700">기업 추천을 불러오는 중입니다.</p></CardContent></Card>
      ) : status === "error" ? (
        <Card className="mt-7 border-rose-100 shadow-sm"><CardContent className="flex min-h-72 flex-col items-center justify-center text-center"><CircleAlert className="h-9 w-9 text-rose-500" /><p className="mt-4 font-semibold text-slate-800">기업 추천을 표시할 수 없습니다.</p><p className="mt-1 text-sm text-slate-500">품목을 선택하거나 분석을 먼저 완료해 주세요.</p><Button asChild className="mt-5 bg-blue-600 hover:bg-blue-700"><Link href="/items">품목 목록으로</Link></Button></CardContent></Card>
      ) : (
        <Card className="mt-7 border-slate-200 shadow-sm">
          <CardHeader className="pb-4"><CardTitle className="text-base">추천 기업(공급사)</CardTitle><CardDescription className="mt-1">AI·실데이터 기반 조달 기업 후보. 카드의 <span className="font-medium text-blue-600">거래 기업 지정</span>으로 현재 거래처를 표시하세요.</CardDescription></CardHeader>
          <CardContent className={suppliers.length > 0 ? "grid gap-4 md:grid-cols-3" : ""}>
            {suppliers.map((supplier, idx) => <div className={`flex flex-col rounded-xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${tradingCompanyId === supplier.id ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200 hover:border-blue-200"}`} key={supplier.id}>
              <div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Building2 className="h-4 w-4" /></div>{tradingCompanyId === supplier.id ? <Badge className="border-0 bg-blue-600 text-white hover:bg-blue-600">현재 거래 기업</Badge> : idx === 0 ? <Badge className="border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-50">1순위 후보</Badge> : null}</div>{supplier.isAi ? <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50"><Sparkles className="mr-0.5 h-3 w-3" />AI 추정</Badge> : <Badge className="border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-50">실데이터</Badge>}</div>
              <div className="mt-3 flex items-center gap-1.5"><p className="font-semibold leading-tight">{supplier.name}</p>{supplier.verified && <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />}</div>
              <p className="mt-0.5 text-xs text-slate-500">{supplier.country}{supplier.type && supplier.type !== "공급사" ? ` · ${supplier.type}` : ""}</p>
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-slate-50 p-2.5 text-xs">
                <div className="flex justify-between"><span className="text-slate-400">적합도</span><span className="font-semibold text-emerald-600">{supplier.match}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">예상 단가</span><span className="font-medium">{supplier.unitPrice != null ? `$${supplier.unitPrice.toLocaleString()}` : "–"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">리드타임</span><span className="font-medium">{supplier.leadDays != null ? `${supplier.leadDays}일` : "–"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">정시납품</span><span className="font-medium">{supplier.otd != null ? `${supplier.otd}%` : "–"}</span></div>
              </div>
              <p className="mt-3 min-h-10 flex-1 text-xs leading-5 text-slate-500"><span className="font-medium text-slate-600">추천 이유 · </span>{supplier.note || "SGRI·조달 적합도 기반 추천"}</p>
              <div className="mt-3 flex gap-2">
                <Button asChild variant="outline" size="sm" className="flex-1 border-slate-200"><Link href={`/suppliers/${supplier.id}${queryId ? `?query_id=${queryId}` : ""}`}>상세</Link></Button>
                <Button type="button" size="sm" onClick={() => void setTradingCompany(supplier.id)} disabled={savingTrading}
                  className={`flex-1 ${tradingCompanyId === supplier.id ? "bg-blue-600 hover:bg-blue-700" : "bg-white text-blue-600 ring-1 ring-inset ring-blue-200 hover:bg-blue-50"}`}>
                  {tradingCompanyId === supplier.id ? <><Check className="mr-1 h-3.5 w-3.5" />거래 기업</> : "거래 기업 지정"}
                </Button>
              </div>
            </div>)}
            {suppliers.length === 0 && <p className="py-8 text-center text-sm text-slate-400">추천 기업이 아직 없어요. 품목 분석을 실행하면 생성됩니다.</p>}
          </CardContent>
        </Card>
      )}

      <section className="mt-7 flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center"><div><p className="font-semibold">이 후보로 보고서 만들기</p><p className="mt-1 text-sm text-slate-500">선택한 국가·기업 후보를 반영해 AI 초안을 생성합니다.</p></div><Button asChild className="w-fit bg-blue-600 hover:bg-blue-700"><Link href={queryId ? `/reports/new?query_id=${queryId}` : "/reports/new"}>보고서 초안 만들기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></section>
    </main>
  </div>
}
