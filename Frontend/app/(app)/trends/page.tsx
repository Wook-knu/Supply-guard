"use client"

// 최신 동향 분석 — AI가 사용자의 공급망 동향을 요약(GET /trends/brief)하고,
// 품목별 SGRI·알림 분포를 표/그래프로 보여준다. (AI 보고서 작성과는 별개 페이지)

import Link from "next/link"
import BackLink from "@/components/back-link"
import { useEffect, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ArrowLeft, ArrowRight, Bot, CircleAlert, FileText, Loader2, Sparkles, TrendingUp } from "lucide-react"
import { api, type TrendBrief } from "@/lib/api"
import { COUNTRY_OPTIONS, getCountryName } from "@/lib/countries"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

function riskColor(sgri: number): string {
  return sgri >= 66 ? "#e11d48" : sgri >= 50 ? "#f59e0b" : sgri >= 25 ? "#eab308" : "#10b981"
}
const SEV = { high: { label: "고위험", color: "#e11d48" }, medium: { label: "주의", color: "#f59e0b" }, low: { label: "안정", color: "#10b981" } }

type RegCountry = { name: string; code: string; item: string; status: "trading" | "registered"; sgri: number | null }
type RegCompany = { name: string; country: string; item: string; status: "trading" | "registered" }

export default function TrendsPage() {
  const [brief, setBrief] = useState<TrendBrief | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [reg, setReg] = useState<{ countries: RegCountry[]; companies: RegCompany[] }>({ countries: [], companies: [] })

  useEffect(() => {
    api.getTrendBrief().then((b) => { setBrief(b); setStatus("ready") }).catch(() => setStatus("error"))
  }, [])

  // 등록한 국가·기업 현황 (내 품목에서 지정한 것) — 등록 국가별 SGRI 포함
  useEffect(() => {
    api.getQueries().then(async (qs) => {
      const items = qs.filter((q) => q.hs_code)
      // 품목(hs)별 국가코드→최신 SGRI 맵
      const hsList = [...new Set(items.map((q) => q.hs_code as string))]
      const riskByHs = new Map<string, Map<string, number>>()
      await Promise.all(hsList.map((hs) => api.getRisks(hs).then((rows) => {
        const latest = new Map<string, { d: string; s: number }>()
        rows.forEach((r) => { const cur = latest.get(r.country_code); const s = r.sgri_score != null ? Math.round(Number(r.sgri_score)) : 0; if (!cur || r.as_of_date > cur.d) latest.set(r.country_code, { d: r.as_of_date, s }) })
        riskByHs.set(hs, new Map([...latest].map(([c, v]) => [c, v.s])))
      }).catch(() => {})))
      const nameToCode = (name: string) => COUNTRY_OPTIONS.find((o) => o.name === name || o.code === name.toUpperCase())?.code ?? name.toUpperCase()
      const countries: RegCountry[] = []
      items.forEach((q) => {
        const trading = new Set((q.trading_country ?? "").split(",").map((s) => s.trim()).filter(Boolean))
        const sgriMap = riskByHs.get(q.hs_code as string)
        ;(q.origin_country ?? "").split(",").map((s) => s.trim()).filter(Boolean).forEach((name) => {
          const code = nameToCode(name)
          countries.push({ name, code, item: q.item_name?.trim() || `HS ${q.hs_code}`, status: trading.has(name) ? "trading" : "registered", sgri: sgriMap?.get(code) ?? null })
        })
      })
      const compLists = await Promise.all(items.map((q) => {
        const rset = new Set((q.registered_company_ids ?? "").split(",").map((s) => Number(s.trim())).filter(Boolean))
        const tset = new Set((q.trading_company_ids ?? "").split(",").map((s) => Number(s.trim())).filter(Boolean))
        if (q.trading_company_id) { rset.add(q.trading_company_id); tset.add(q.trading_company_id) }
        if (rset.size === 0) return Promise.resolve<RegCompany[]>([])
        return api.getSupplierRecos(q.query_id)
          .then((rows) => rows.filter((r) => rset.has(r.company.company_id)).map((r): RegCompany => ({ name: r.company.name, country: getCountryName(r.company.country_code ?? ""), item: q.item_name?.trim() || `HS ${q.hs_code}`, status: tset.has(r.company.company_id) ? "trading" : "registered" })))
          .catch((): RegCompany[] => [])
      }))
      setReg({ countries, companies: compLists.flat() })
    }).catch(() => {})
  }, [])

  const items = brief?.stats.items ?? []
  const chartData = items.map((i) => ({ name: i.name.length > 8 ? i.name.slice(0, 8) + "…" : i.name, sgri: i.sgri }))
  const sev = brief?.stats.alert_by_severity ?? { high: 0, medium: 0, low: 0 }
  const types = Object.entries(brief?.stats.alert_by_type ?? {})

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <main className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <BackLink />
      <div className="mt-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><TrendingUp className="h-4 w-4" /> 최신 동향 분석</div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">지금 내 공급망은 어떻게 움직이나요?</h1>
          <p className="mt-2 text-sm text-slate-500">AI가 등록 품목의 SGRI와 최근 알림을 종합해 동향을 요약합니다. 보고서 작성은 <Link href="/reports/new" className="text-blue-600 hover:underline">AI 보고서</Link>에서.</p>
        </div>
        <Button asChild variant="outline" className="w-fit border-slate-200"><Link href="/reports/new"><FileText className="mr-2 h-4 w-4" />보고서로 정리하기</Link></Button>
      </div>

      {status === "loading" ? (
        <Card className="mt-7 border-slate-200 shadow-sm"><CardContent className="flex min-h-72 flex-col items-center justify-center text-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /><p className="mt-4 text-sm font-medium text-slate-700">AI가 최신 동향을 분석하고 있습니다.</p></CardContent></Card>
      ) : status === "error" || !brief ? (
        <Card className="mt-7 border-rose-100 shadow-sm"><CardContent className="flex min-h-72 flex-col items-center justify-center text-center"><CircleAlert className="h-9 w-9 text-rose-500" /><p className="mt-4 font-semibold text-slate-800">동향을 불러오지 못했습니다.</p><p className="mt-1 text-sm text-slate-500">잠시 후 다시 시도해 주세요.</p></CardContent></Card>
      ) : <>
        {/* AI 요약 */}
        <Card className="mt-7 border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 shadow-sm">
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Bot className="h-5 w-5" /></div>
            <div className="flex-1">
              <div className="flex items-center gap-2"><p className="font-semibold">AI 동향 요약</p>{brief.source === "gemini" ? <Badge className="border-blue-100 bg-white text-blue-700 hover:bg-white"><Sparkles className="mr-0.5 h-3 w-3" />Gemini</Badge> : <Badge className="border-slate-200 bg-white text-slate-500 hover:bg-white">데이터 기반</Badge>}</div>
              <p className="mt-1.5 text-sm leading-6 text-slate-700">{brief.summary}</p>
              {(brief.watch_items?.length ?? 0) > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{brief.watch_items!.map((w) => <Badge key={w} className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">주의 · {w}</Badge>)}</div>}
            </div>
          </CardContent>
        </Card>

        {/* 핵심 지표 타일 */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="모니터링 품목" value={`${brief.stats.item_count}개`} tone="slate" />
          <StatTile label="평균 SGRI" value={brief.stats.avg_sgri != null ? String(brief.stats.avg_sgri) : "—"} tone="blue" />
          <StatTile label="최고 위험 SGRI" value={brief.stats.max_sgri != null ? String(brief.stats.max_sgri) : "—"} tone="rose" />
          <StatTile label="고위험 품목(50+)" value={`${brief.stats.high_count}개`} tone="amber" />
        </div>

        {(brief.highlights?.length ?? 0) > 0 && (
          <Card className="mt-6 border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">핵심 변화</CardTitle></CardHeader>
            <CardContent className="space-y-2.5">{brief.highlights!.map((h, i) => <div key={i} className="flex items-start gap-2.5 text-sm"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600">{i + 1}</span><span className="leading-6 text-slate-700">{h}</span></div>)}</CardContent>
          </Card>
        )}

        {/* 등록 국가·기업 현황 */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base">등록 국가 SGRI</CardTitle><CardDescription className="mt-1">내가 거래중·관심으로 등록한 국가의 SGRI 위험도</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {reg.countries.length > 0 ? reg.countries.map((c, i) => <div key={`${c.name}-${c.item}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate"><span className="font-medium text-slate-700">{c.name}</span><span className="ml-1.5 text-xs text-slate-400">· {c.item}</span></span>
                <span className="flex shrink-0 items-center gap-2">
                  {c.sgri != null ? <span className="text-base font-bold" style={{ color: riskColor(c.sgri) }}>{c.sgri}</span> : <span className="text-xs text-slate-300">미분석</span>}
                  <Badge className={c.status === "trading" ? "border-0 bg-blue-600 text-white hover:bg-blue-600" : "border-0 bg-emerald-600 text-white hover:bg-emerald-600"}>{c.status === "trading" ? "거래중" : "관심"}</Badge>
                </span>
              </div>)
                : <p className="py-6 text-center text-xs text-slate-400">등록한 국가가 없습니다. 대체 공급국에서 등록하세요.</p>}
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base">등록 기업 현황</CardTitle><CardDescription className="mt-1">내가 거래중·등록으로 지정한 기업</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {reg.companies.length > 0 ? reg.companies.map((c, i) => <div key={`${c.name}-${i}`} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate font-medium text-slate-700">{c.name}<span className="ml-1.5 text-xs text-slate-400">· {c.country} · {c.item}</span></span><Badge className={c.status === "trading" ? "border-0 bg-blue-600 text-white hover:bg-blue-600" : "border-0 bg-emerald-600 text-white hover:bg-emerald-600"}>{c.status === "trading" ? "거래중" : "등록"}</Badge></div>)
                : <p className="py-6 text-center text-xs text-slate-400">지정한 기업이 없습니다. 기업 추천에서 지정하세요.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* 품목별 SGRI */}
          <Card className="border-slate-200 shadow-sm lg:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-base">품목별 공급망 위험도(SGRI)</CardTitle><CardDescription className="mt-1">등록 국가(거래중 우선) 기준 · 높을수록 위험</CardDescription></CardHeader>
            <CardContent>
              {chartData.length > 0 ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 8, left: -20, right: 8, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0" }} /><Bar dataKey="sgri" name="SGRI" radius={[6, 6, 0, 0]}>{chartData.map((d, i) => <Cell key={i} fill={riskColor(d.sgri)} />)}</Bar></BarChart></ResponsiveContainer></div>
                : <div className="grid h-64 place-items-center text-sm text-slate-400">등록된 품목이 없습니다.</div>}
            </CardContent>
          </Card>

          {/* 알림 분포 */}
          <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base">알림 분포</CardTitle><CardDescription className="mt-1">총 {brief.stats.alert_total}건</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {(["high", "medium", "low"] as const).map((k) => {
                  const total = brief.stats.alert_total || 1
                  const v = sev[k]
                  return <div key={k}><div className="mb-1 flex justify-between text-xs"><span className="text-slate-500">{SEV[k].label}</span><span className="font-medium">{v}건</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(v / total) * 100}%`, backgroundColor: SEV[k].color }} /></div></div>
                })}
              </div>
              {types.length > 0 && <div className="border-t border-slate-100 pt-3"><p className="mb-2 text-xs font-medium text-slate-400">유형별</p><div className="flex flex-wrap gap-1.5">{types.map(([t, n]) => <Badge key={t} className="border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-50">{t} {n}</Badge>)}</div></div>}
            </CardContent>
          </Card>
        </div>

        {/* 품목 표 */}
        <Card className="mt-6 border-slate-200 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base">품목 동향 표</CardTitle></CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-y border-slate-100 bg-slate-50 text-left text-xs text-slate-500"><th className="py-2.5 pl-6 font-medium">품목</th><th className="font-medium">HS</th><th className="font-medium">SGRI</th><th className="font-medium">등급</th><th className="pr-6 font-medium">이동</th></tr></thead>
              <tbody>{items.map((i) => <tr key={i.hs ?? i.name} className="border-b border-slate-50 last:border-0"><td className="py-3 pl-6 font-medium text-slate-800">{i.name}</td><td className="font-mono text-slate-500">{i.hs ?? "-"}</td><td className="font-semibold" style={{ color: riskColor(i.sgri) }}>{Math.round(i.sgri)}</td><td>{i.level ?? "-"}</td><td className="pr-6">{i.hs ? <Link href={`/risks/${i.hs}`} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">상세 <ArrowRight className="h-3 w-3" /></Link> : "-"}</td></tr>)}
                {items.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">등록된 품목이 없습니다.</td></tr>}</tbody>
            </table></div>
          </CardContent>
        </Card>
      </>}
    </main>
  </div>
}

function StatTile({ label, value, tone }: { label: string; value: string; tone: "slate" | "blue" | "rose" | "amber" }) {
  const c = { slate: "text-slate-800", blue: "text-blue-600", rose: "text-rose-600", amber: "text-amber-600" }[tone]
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 text-2xl font-bold tracking-tight ${c}`}>{value}</p></div>
}
