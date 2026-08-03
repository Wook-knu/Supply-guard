"use client"

// 벤치마크 — 이 품목의 6지표/SGRI가 SupplyGuard 전체 데이터 평균 대비 어디인지 상대 위치.
// 백엔드: GET /benchmark/item/{hs_code}[?country_code=]. 데이터 기반(경쟁사 날조 없음).

import Link from "next/link"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { api, type ItemBenchmark, type QueryOut } from "@/lib/api"
import { COUNTRY_OPTIONS } from "@/lib/countries"
import { ArrowLeft, Bell, BarChart3, Loader2, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const verdictCls = (v: string) =>
  v.includes("안전") || v === "우수" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
  : v.includes("위험") || v === "미흡" ? "border-rose-200 bg-rose-50 text-rose-600"
  : "border-slate-200 bg-slate-50 text-slate-500"

export default function BenchmarkPage() {
  const [items, setItems] = useState<QueryOut[]>([])
  const [hs, setHs] = useState("283691")
  const [country, setCountry] = useState("")
  const [data, setData] = useState<ItemBenchmark | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    api.getQueries()
      .then((rows) => {
        const withHs = rows.filter((r) => r.hs_code)
        setItems(withHs)
        if (withHs[0]?.hs_code) setHs(withHs[0].hs_code)
      })
      .catch(() => {})
  }, [])

  const run = (hsCode: string, cc: string) => {
    const clean = hsCode.replace(/[^0-9]/g, "")
    if (!clean) return
    setLoading(true)
    api.getItemBenchmark(clean, cc || undefined)
      .then((d) => { setData(d); setError(d.error ? "해당 품목의 SGRI 데이터가 아직 없습니다. 먼저 품목을 분석해 주세요." : "") })
      .catch(() => setError("벤치마크를 불러오지 못했습니다."))
      .finally(() => setLoading(false))
  }

  useEffect(() => { run(hs, country) /* eslint-disable-next-line */ }, [])

  const submit = (e: FormEvent) => { e.preventDefault(); run(hs, country) }

  const maxScale = 100
  const itemName = useMemo(() => items.find((i) => i.hs_code === hs)?.item_name, [items, hs])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link>
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="relative text-slate-600"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8 md:px-8">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기</Link>
        <div className="mt-6">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><BarChart3 className="h-4 w-4" /> 벤치마크</div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">내 품목은 평균 대비 얼마나 위험할까요?</h1>
          <p className="mt-2 text-sm text-slate-500">SupplyGuard 전체 품목·국가 SGRI 데이터 안에서의 상대 위치입니다. (실제 데이터 기반 — 경쟁사 사례를 지어내지 않습니다)</p>
        </div>

        {/* 조회 폼 */}
        <form onSubmit={submit} className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">HS 코드 / 품목</label>
            {items.length > 0 ? (
              <select value={hs} onChange={(e) => setHs(e.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                {items.map((i) => <option key={i.query_id} value={i.hs_code ?? ""}>{i.item_name} (HS {i.hs_code})</option>)}
                {!items.some((i) => i.hs_code === "283691") && <option value="283691">리튬 탄산염 (HS 283691)</option>}
              </select>
            ) : (
              <Input value={hs} onChange={(e) => setHs(e.target.value)} placeholder="예: 283691" className="h-10 w-40" />
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">국가 상대 위치 (선택)</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— 선택 안 함 —</option>
              {COUNTRY_OPTIONS.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
            </select>
          </div>
          <Button type="submit" disabled={loading} className="h-10 bg-blue-600 hover:bg-blue-700">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "조회"}</Button>
        </form>

        {error && <div role="alert" className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{error}</div>}

        {loading ? (
          <div className="flex justify-center py-20 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : data && !data.error ? (
          <div className="mt-6 space-y-6">
            {/* SGRI 종합 */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">종합 SGRI {itemName ? `· ${itemName}` : ""}</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-6">
                  <div><p className="text-xs text-slate-400">이 품목 평균</p><p className="text-3xl font-bold tracking-tight text-slate-800">{data.item_avg_sgri}</p></div>
                  <div className="text-slate-300">vs</div>
                  <div><p className="text-xs text-slate-400">전체 품목 평균</p><p className="text-3xl font-bold tracking-tight text-slate-400">{data.all_items_avg_sgri}</p></div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-semibold ${verdictCls(data.sgri_verdict ?? "")}`}>
                      {(data.sgri_delta ?? 0) >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {(data.sgri_delta ?? 0) > 0 ? "+" : ""}{data.sgri_delta} · {data.sgri_verdict}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 6지표 비교 */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">지표별 상대 위치 (6개)</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {(data.indicators ?? []).map((ind) => (
                  <div key={ind.key}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700"><span className="mr-1.5 text-xs font-bold text-blue-500">{ind.key}</span>{ind.label}</span>
                      <span className="flex items-center gap-2"><span className="text-slate-500">{ind.item_avg}</span><Badge variant="outline" className={`text-[11px] ${verdictCls(ind.verdict)}`}>{ind.delta > 0 ? "+" : ""}{ind.delta}</Badge></span>
                    </div>
                    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${ind.delta >= 5 ? "bg-rose-400" : ind.delta <= -5 ? "bg-emerald-400" : "bg-blue-400"}`} style={{ width: `${Math.min(100, (ind.item_avg / maxScale) * 100)}%` }} />
                      {/* 전체 평균 마커 */}
                      <div className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-slate-500" style={{ left: `${Math.min(100, (ind.all_avg / maxScale) * 100)}%` }} title={`전체 평균 ${ind.all_avg}`} />
                    </div>
                  </div>
                ))}
                <p className="pt-1 text-xs text-slate-400"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-400 align-middle" /> 이 품목 지표값 · <span className="mx-1 inline-block h-3 w-0.5 bg-slate-500 align-middle" /> 전체 품목 평균 · 오른쪽일수록 위험</p>
              </CardContent>
            </Card>

            {/* 국가 상대 위치 */}
            {data.country && (
              <Card className="border-blue-200 bg-blue-50/40 shadow-sm">
                <CardHeader className="pb-3"><CardTitle className="text-base">{data.country.country_code} 국가 상대 위치</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-700">{data.country.summary}</p>
                  <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                    <div><p className="text-2xl font-bold text-slate-800">{data.country.sgri}</p><p className="text-xs text-slate-400">국가 SGRI</p></div>
                    <div><p className="text-2xl font-bold text-slate-800">상위 {data.country.risk_percentile}%</p><p className="text-xs text-slate-400">위험 순위 ({data.country.candidate_countries}개국 중)</p></div>
                    <div><p className={`text-2xl font-bold ${data.country.vs_item_avg >= 0 ? "text-rose-500" : "text-emerald-600"}`}>{data.country.vs_item_avg > 0 ? "+" : ""}{data.country.vs_item_avg}</p><p className="text-xs text-slate-400">품목 평균 대비</p></div>
                  </div>
                </CardContent>
              </Card>
            )}
            <p className="text-center text-xs text-slate-400">기준: {data.basis}</p>
          </div>
        ) : null}
      </main>
    </div>
  )
}
