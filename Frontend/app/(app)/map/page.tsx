"use client"

// 글로벌 공급망 지도 (전체 페이지) — 선택 품목의 공급국을 세계지도에 SGRI 색으로 표시.
// 국가 클릭 → 그 국가 SGRI + 소재 추천 기업 + 상세 링크. 드래그·확대/축소·국가 라벨 지원.

import Link from "next/link"
import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"
import { api, type QueryOut, type RiskOut, type SupplierReco } from "@/lib/api"
import { getCountryName } from "@/lib/countries"
import { ArrowLeft, Bell, Building2, Globe2, MapPin, ShieldAlert } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const WorldRiskMap = dynamic(() => import("@/components/world-risk-map"), {
  ssr: false,
  loading: () => <div className="grid h-[460px] place-items-center text-sm text-slate-400">지도를 불러오는 중…</div>,
})
const riskColor = (sgri: number | null) => (sgri == null ? "#94a3b8" : sgri >= 60 ? "#ef4444" : sgri >= 35 ? "#f59e0b" : "#10b981")
const levelOf = (sgri: number | null) => (sgri == null ? "데이터 없음" : sgri >= 60 ? "높음" : sgri >= 35 ? "주의" : "안전")

export default function MapPage() {
  const [items, setItems] = useState<QueryOut[]>([])
  const [hs, setHs] = useState("283691")
  const [risks, setRisks] = useState<RiskOut[]>([])
  const [suppliers, setSuppliers] = useState<SupplierReco[]>([])
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)

  useEffect(() => {
    api.getQueries().then((qs) => {
      const withHs = qs.filter((q) => q.hs_code)
      setItems(withHs)
      if (withHs[0]?.hs_code) setHs(withHs[0].hs_code)
    }).catch(() => {})
  }, [])

  const selectedQuery = useMemo(() => items.find((i) => i.hs_code === hs), [items, hs])

  useEffect(() => {
    setSelectedCountry(null)
    api.getRisks(hs).then(setRisks).catch(() => setRisks([]))
    if (selectedQuery?.query_id != null) api.getSupplierRecos(selectedQuery.query_id).then(setSuppliers).catch(() => setSuppliers([]))
    else setSuppliers([])
  }, [hs, selectedQuery])

  // 국가별 최신 SGRI → 지도 마커
  const points = useMemo(() => {
    const latest = new Map<string, RiskOut>()
    risks.forEach((r) => {
      const cur = latest.get(r.country_code)
      if (!cur || r.as_of_date > cur.as_of_date) latest.set(r.country_code, r)
    })
    return [...latest.values()].map((r) => ({ code: r.country_code, sgri: r.sgri_score != null ? Math.round(Number(r.sgri_score)) : null }))
  }, [risks])

  const sel = selectedCountry ? points.find((p) => p.code === selectedCountry) : null
  const selCompanies = selectedCountry ? suppliers.filter((s) => s.company.country_code === selectedCountry) : []
  const itemName = selectedQuery?.item_name?.trim() || (hs ? `HS ${hs}` : "")
  const ranked = [...points].sort((a, b) => (b.sgri ?? -1) - (a.sgri ?? -1))

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link>
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="relative text-slate-600"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기</Link>
        <div className="mt-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><Globe2 className="h-4 w-4" /> 글로벌 공급망 지도</div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">공급국 위험도를 지도에서 확인하세요</h1>
            <p className="mt-2 text-sm text-slate-500">품목의 공급국을 SGRI 색으로 표시합니다. 드래그로 이동, 우측 +/−로 확대·축소, 국가를 클릭하면 상세와 기업이 표시됩니다.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">품목 선택</label>
            {items.length > 0 ? (
              <select value={hs} onChange={(e) => setHs(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                {items.map((i) => <option key={i.query_id} value={i.hs_code ?? ""}>{i.item_name} (HS {i.hs_code})</option>)}
                {!items.some((i) => i.hs_code === "283691") && <option value="283691">리튬 탄산염 (HS 283691)</option>}
              </select>
            ) : (
              <input value={hs} onChange={(e) => setHs(e.target.value)} placeholder="예: 283691" className="h-10 w-40 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
          {/* 지도 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
              <span className="text-sm font-medium text-slate-600">{itemName} · 공급국 {points.length}개국</span>
              <div className="flex items-center gap-3 text-[11px] text-slate-400"><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />안전</span><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />주의</span><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />높음</span></div>
            </div>
            <WorldRiskMap points={points} selected={selectedCountry} onSelect={setSelectedCountry} showLabels height={480} />
            {points.length === 0 && <p className="py-3 text-center text-xs text-slate-400">이 품목의 국가별 SGRI 데이터가 없습니다. 리스크 분석을 먼저 실행해 주세요.</p>}
          </div>

          {/* 우측 상세 패널 */}
          <div className="space-y-4">
            {sel ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: riskColor(sel.sgri) }}>{sel.code}</span>
                  <div><p className="font-semibold">{getCountryName(sel.code)}</p><p className="text-xs text-slate-400">국가 SGRI {sel.sgri ?? "–"} · {levelOf(sel.sgri)}</p></div>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-slate-500">이 국가 추천 기업</p>
                  <div className="space-y-2">
                    {selCompanies.length > 0 ? selCompanies.slice(0, 6).map((s) => (
                      <Link key={s.company.company_id} href={`/suppliers/${s.company.company_id}${selectedQuery?.query_id ? `?query_id=${selectedQuery.query_id}` : ""}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 transition-colors hover:bg-slate-50">
                        <span className="flex items-center gap-1.5 truncate text-sm"><Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />{s.company.name}</span>
                        <span className="flex shrink-0 items-center gap-1.5"><span className="text-xs font-semibold text-emerald-600">{Math.round(Number(s.fit_score ?? 0))}</span>{(s.company.data_source ?? "").startsWith("ai:") ? <Badge className="border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-700 hover:bg-amber-50">AI</Badge> : <Badge className="border-blue-100 bg-blue-50 px-1.5 py-0 text-[10px] text-blue-700 hover:bg-blue-50">실</Badge>}</span>
                      </Link>
                    )) : <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">이 국가의 추천 기업이 목록에 없어요.</p>}
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button asChild size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700"><Link href={`/risks/${hs}`}>위험도 상세</Link></Button>
                  <Button asChild size="sm" variant="outline" className="flex-1 border-slate-200"><Link href={selectedQuery?.query_id ? `/recommendations?query_id=${selectedQuery.query_id}` : "/recommendations"}>추천</Link></Button>
                </div>
              </div>
            ) : (
              <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm text-slate-400"><div><MapPin className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-2 leading-6">지도에서 국가를 클릭하면<br />위험도와 기업이 여기에 표시됩니다</p></div></div>
            )}

            {/* 공급국 순위 목록 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 px-1 text-xs font-medium text-slate-500">공급국 위험 순위</p>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {ranked.map((p, idx) => (
                  <button key={p.code} onClick={() => setSelectedCountry(p.code)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${selectedCountry === p.code ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                    <span className="w-5 text-xs text-slate-400">{idx + 1}</span>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: riskColor(p.sgri) }} />
                    <span className="flex-1 truncate">{getCountryName(p.code)}</span>
                    <span className="text-sm font-semibold text-slate-700">{p.sgri ?? "–"}</span>
                  </button>
                ))}
                {ranked.length === 0 && <p className="py-4 text-center text-xs text-slate-400">데이터 없음</p>}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
