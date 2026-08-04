"use client"

// 글로벌 공급망 지도 (전체 화면) — 페이지 전체가 지도. 공급국을 SGRI 색으로 표시,
// 드래그·확대/축소·국가 라벨. 좌상단 컨트롤, 국가 클릭 시 우측 상세 패널.

import Link from "next/link"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { api, type QueryOut, type RiskOut, type SupplierReco } from "@/lib/api"
import { getCountryName } from "@/lib/countries"
import { ArrowLeft, Building2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const WorldRiskMap = dynamic(() => import("@/components/world-risk-map"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-slate-400">지도를 불러오는 중…</div>,
})
const riskColor = (sgri: number | null) => (sgri == null ? "#94a3b8" : sgri >= 60 ? "#ef4444" : sgri >= 35 ? "#f59e0b" : "#10b981")
const levelOf = (sgri: number | null) => (sgri == null ? "데이터 없음" : sgri >= 60 ? "높음" : sgri >= 35 ? "주의" : "안전")

export default function MapPage() {
  const router = useRouter()
  const [items, setItems] = useState<QueryOut[]>([])
  const [hs, setHs] = useState("")   // 품목 로드 후 첫 등록 품목으로 자동 선택
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
  // 줌인한 국가 안에 점으로 찍을 기업들
  const companyPoints = useMemo(() => suppliers.map((s) => ({
    companyId: s.company.company_id, name: s.company.name,
    countryCode: s.company.country_code ?? "", isAi: (s.company.data_source ?? "").startsWith("ai:"),
  })), [suppliers])
  const goCompany = (id: number) => router.push(`/suppliers/${id}${selectedQuery?.query_id ? `?query_id=${selectedQuery.query_id}` : ""}`)

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#eef2f7]">
      {/* 지도 (전체 화면) */}
      <div className="absolute inset-0">
        <WorldRiskMap points={points} selected={selectedCountry} onSelect={setSelectedCountry} showLabels fill height={760}
          companies={companyPoints} focusCountry={selectedCountry} onCompanySelect={goCompany} />
      </div>

      {/* 좌상단: 뒤로 + 품목 선택 + 범례 */}
      <div className="absolute left-4 top-4 z-10 w-64 max-w-[calc(100%-2rem)] space-y-2">
        <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-3.5 w-3.5" /> 대시보드</Link>
          <p className="mt-2 text-sm font-semibold">글로벌 공급망 지도</p>
          <label className="mb-1 mt-3 block text-[11px] font-medium text-slate-400">품목</label>
          {items.length > 0 ? (
            <select value={hs} onChange={(e) => setHs(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
              {items.map((i) => <option key={i.query_id} value={i.hs_code ?? ""}>{i.item_name} (HS {i.hs_code})</option>)}
              
            </select>
          ) : (
            <input value={hs} onChange={(e) => setHs(e.target.value)} placeholder="예: 283691" className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          )}
          {items.length === 0 && <Link href="/items/new" className="mt-2 block text-[11px] font-medium text-blue-600 hover:underline">품목을 등록하면 목록에서 바로 고를 수 있어요 →</Link>}
          <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />안전</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />주의</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />높음</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">공급국 {points.length}개국 · 국가를 클릭하면 확대되고 기업이 점으로 표시됩니다.</p>
        </div>
        {selectedCountry && (
          <button onClick={() => setSelectedCountry(null)} className="w-full rounded-2xl border border-slate-200 bg-white/95 px-4 py-2 text-sm font-medium text-slate-600 shadow-lg backdrop-blur hover:bg-slate-50">← 전체 지도 보기</button>
        )}
      </div>

      {/* 우측: 국가 상세 패널 */}
      {sel && (
        <div className="absolute bottom-4 right-4 top-4 z-10 flex w-80 max-w-[calc(100%-2rem)] flex-col rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-xl backdrop-blur">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: riskColor(sel.sgri) }}>{sel.code}</span>
              <div><p className="font-semibold">{getCountryName(sel.code)}</p><p className="text-xs text-slate-400">국가 SGRI {sel.sgri ?? "–"} · {levelOf(sel.sgri)}</p></div>
            </div>
            <button onClick={() => setSelectedCountry(null)} aria-label="닫기" className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
          </div>

          <p className="mb-2 mt-5 text-xs font-medium text-slate-500">이 국가 추천 기업</p>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {selCompanies.length > 0 ? selCompanies.map((s) => (
              <Link key={s.company.company_id} href={`/suppliers/${s.company.company_id}${selectedQuery?.query_id ? `?query_id=${selectedQuery.query_id}` : ""}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 transition-colors hover:bg-slate-50">
                <span className="flex items-center gap-1.5 truncate text-sm"><Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />{s.company.name}</span>
                <span className="flex shrink-0 items-center gap-1.5"><span className="text-xs font-semibold text-emerald-600">{Math.round(Number(s.fit_score ?? 0))}</span>{(s.company.data_source ?? "").startsWith("ai:") ? <Badge className="border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-700 hover:bg-amber-50">AI</Badge> : <Badge className="border-blue-100 bg-blue-50 px-1.5 py-0 text-[10px] text-blue-700 hover:bg-blue-50">실</Badge>}</span>
              </Link>
            )) : <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">이 국가의 추천 기업이 목록에 없어요.</p>}
          </div>

          <div className="mt-4 flex gap-2">
            <Button asChild size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700"><Link href={`/risks/${hs}`}>위험도 상세</Link></Button>
            <Button asChild size="sm" variant="outline" className="flex-1 border-slate-200"><Link href={selectedQuery?.query_id ? `/recommendations?query_id=${selectedQuery.query_id}` : "/recommendations"}>추천</Link></Button>
          </div>
        </div>
      )}
    </div>
  )
}
