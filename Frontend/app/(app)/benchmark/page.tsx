"use client"

// 벤치마크 — 이 품목의 6지표/SGRI가 SupplyGuard 전체 데이터 평균 대비 어디인지 상대 위치.
// 백엔드: GET /benchmark/item/{hs_code}[?country_code=]. 데이터 기반(경쟁사 날조 없음).

import Link from "next/link"
import BackLink from "@/components/back-link"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { api, type ItemBenchmark, type QueryOut } from "@/lib/api"
import { COUNTRY_OPTIONS, getCountryName } from "@/lib/countries"
import { ArrowLeft, Bell, BarChart3, ExternalLink, Loader2, Newspaper, ShieldAlert, Sparkles, TrendingDown, TrendingUp } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const verdictCls = (v: string) =>
  v.includes("안전") || v === "우수" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
  : v.includes("위험") || v === "미흡" ? "border-rose-200 bg-rose-50 text-rose-600"
  : "border-slate-200 bg-slate-50 text-slate-500"

export default function BenchmarkPage() {
  const [items, setItems] = useState<QueryOut[]>([])
  const [hs, setHs] = useState("")
  const [country, setCountry] = useState("")
  const [data, setData] = useState<ItemBenchmark | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [cases, setCases] = useState<import("@/lib/api").PeerCase[] | null>(null)
  const [casesLoading, setCasesLoading] = useState(false)
  const [news, setNews] = useState<import("@/lib/api").RealArticle[] | null>(null)
  const [newsTerm, setNewsTerm] = useState("")
  const [newsLoading, setNewsLoading] = useState(false)

  const loadCases = () => {
    const clean = hs.replace(/[^0-9]/g, "")
    if (!clean || casesLoading) return
    setCasesLoading(true)
    api.getPeerCases(clean)
      .then((r) => setCases(r.cases ?? []))
      .catch(() => setCases([]))
      .finally(() => setCasesLoading(false))
  }

  const loadNews = () => {
    const clean = hs.replace(/[^0-9]/g, "")
    if (!clean || newsLoading) return
    setNewsLoading(true)
    api.getRealNews(clean)
      .then((r) => { setNews(r.articles ?? []); setNewsTerm(r.term ?? "") })
      .catch(() => { setNews([]); setNewsTerm("") })
      .finally(() => setNewsLoading(false))
  }

  useEffect(() => {
    api.getQueries()
      .then((rows) => {
        const withHs = rows.filter((r) => r.hs_code)
        setItems(withHs)
        // 첫 등록 품목을 자동 선택하고 바로 조회(하드코딩 기본값 제거).
        if (withHs[0]?.hs_code) { setHs(withHs[0].hs_code); run(withHs[0].hs_code, "") }
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
  // 지표 행: 국가 선택 시 (그 국가 값 vs 이 품목 평균), 아니면 (이 품목 평균 vs 전체 품목 평균)
  const indRows = useMemo(() => {
    if (data?.country?.indicators) return data.country.indicators.map((x) => ({ key: x.key, label: x.label, val: x.value, base: x.item_avg, delta: x.delta, verdict: x.verdict }))
    return (data?.indicators ?? []).map((x) => ({ key: x.key, label: x.label, val: x.item_avg, base: x.all_avg, delta: x.delta, verdict: x.verdict }))
  }, [data])
  const indMode = data?.country ? "country" : "item"

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link>
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="relative text-slate-600"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8 md:px-8">
        <BackLink />
        <div className="mt-6">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><BarChart3 className="h-4 w-4" /> 벤치마크</div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">내 품목은 평균 대비 얼마나 위험할까요?</h1>
          <p className="mt-2 text-sm text-slate-500">SupplyGuard 전체 품목·국가 SGRI 데이터 안에서의 상대 위치입니다.</p>
        </div>

        {/* 이 페이지가 제공하는 것 */}
        <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
          <p className="text-sm font-semibold text-emerald-800">✔ 이 페이지가 제공하는 것</p>
          <ul className="mt-1.5 space-y-1 text-xs leading-5 text-emerald-700">
            <li>· <span className="font-semibold">SGRI 상대 위치</span> — 내 품목·국가의 6지표가 전체 평균 대비 높은지/낮은지, 후보국 위험 순위 (실제 SGRI 데이터)</li>
            <li>· <span className="font-semibold">AI 또래 중소기업 예시 사례</span> — 이 품목 조달 시 겪을 법한 상황·대응·결과 (AI 생성 예시)</li>
            <li>· <span className="font-semibold">실제 뉴스·사례</span> — 이 품목 공급망 관련 실제 기사 (GDELT, 출처 링크)</li>
          </ul>
        </div>

        {/* 또래 중소기업 예시 사례 (AI 생성) */}
        <div className="mt-5 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-600" /><p className="text-base font-semibold">또래 중소기업 사례</p><Badge className="border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50">AI 예시</Badge></div>
              <p className="mt-1 text-sm text-slate-500">이 품목을 조달하는 중소기업이 겪을 법한 상황·대응·결과를 AI가 예시로 보여줍니다. <span className="font-medium text-slate-600">실제 거래 기록이 아닙니다.</span></p>
            </div>
            <Button onClick={loadCases} disabled={casesLoading} className="w-fit bg-violet-600 hover:bg-violet-700">{casesLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{cases ? "다시 생성" : "AI 사례 보기"}</Button>
          </div>
          {cases && cases.length > 0 && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {cases.map((c, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-800">{c.profile}</p>
                  <dl className="mt-2 space-y-1.5 text-xs leading-5">
                    <div><dt className="inline font-medium text-slate-500">상황 · </dt><dd className="inline text-slate-600">{c.situation}</dd></div>
                    <div><dt className="inline font-medium text-slate-500">대응 · </dt><dd className="inline text-slate-600">{c.action}</dd></div>
                    <div><dt className="inline font-medium text-emerald-700">결과 · </dt><dd className="inline text-slate-700">{c.outcome}</dd></div>
                    <div className="rounded-md bg-violet-50 px-2 py-1.5"><dt className="inline font-medium text-violet-700">시사점 · </dt><dd className="inline text-violet-800">{c.lesson}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
          )}
          {cases && cases.length === 0 && <p className="mt-4 text-center text-sm text-slate-400">사례를 생성하지 못했습니다. (GEMINI 키 설정 또는 잠시 후 재시도)</p>}
        </div>

        {/* 실제 뉴스·사례 (GDELT, 출처 있음) */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2"><Newspaper className="h-4 w-4 text-blue-600" /><p className="text-base font-semibold">이 품목 실제 뉴스·사례</p><Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">실제 · 출처 있음</Badge></div>
              <p className="mt-1 text-sm text-slate-500">GDELT 글로벌 뉴스에서 이 품목의 <span className="font-medium text-slate-600">실제 기사</span>를 최신순으로 가져옵니다.{newsTerm ? <> 검색어: <span className="font-medium text-blue-600">‘{newsTerm}’</span></> : ""}</p>
            </div>
            <Button onClick={loadNews} disabled={newsLoading} variant="outline" className="w-fit border-slate-200">{newsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Newspaper className="mr-2 h-4 w-4" />}{news ? "새로고침" : "실제 뉴스 보기"}</Button>
          </div>
          {news && news.length > 0 && (
            <div className="mt-4 divide-y divide-slate-100">
              {news.map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noreferrer" className="group flex items-start justify-between gap-3 py-3 transition-colors hover:bg-slate-50">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800 group-hover:text-blue-600">{a.title}</p><p className="mt-0.5 text-xs text-slate-400">{a.domain}{a.date ? ` · ${a.date}` : ""}</p></div>
                  <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 group-hover:text-blue-500" />
                </a>
              ))}
            </div>
          )}
          {news && news.length === 0 && <p className="mt-4 text-center text-sm text-slate-400">{newsTerm ? `‘${newsTerm}’ ` : ""}관련 최신 영문 뉴스를 찾지 못했습니다. (희소 품목이거나 영문명 미등록일 수 있어요)</p>}
        </div>

        {/* 조회 폼 */}
        <form onSubmit={submit} className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">HS 코드 / 품목</label>
            {items.length > 0 ? (
              <select value={hs} onChange={(e) => setHs(e.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                {items.map((i) => <option key={i.query_id} value={i.hs_code ?? ""}>{i.item_name} (HS {i.hs_code})</option>)}
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
            {/* SGRI 종합 — 국가 선택 시 그 국가 vs 이 품목 평균, 아니면 이 품목 평균 vs 전체 품목 평균 */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">종합 SGRI {itemName ? `· ${itemName}` : ""}{data.country ? ` · ${getCountryName(data.country.country_code)}` : ""}</CardTitle></CardHeader>
              <CardContent>
                {data.country ? (
                  <>
                    <div className="flex flex-wrap items-center gap-6">
                      <div><p className="text-xs text-slate-400">{getCountryName(data.country.country_code)} SGRI</p><p className="text-3xl font-bold tracking-tight" style={{ color: data.country.sgri >= 50 ? "#e11d48" : data.country.sgri >= 35 ? "#f59e0b" : "#10b981" }}>{data.country.sgri}</p></div>
                      <div className="text-slate-300">vs</div>
                      <div><p className="text-xs text-slate-400">이 품목 전체국가 평균</p><p className="text-3xl font-bold tracking-tight text-slate-400">{data.country.item_avg_sgri}</p></div>
                      <div className="ml-auto flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-semibold ${verdictCls(data.country.verdict ?? "")}`}>
                          {(data.country.vs_item_avg ?? 0) >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                          {(data.country.vs_item_avg ?? 0) > 0 ? "+" : ""}{data.country.vs_item_avg} · {data.country.verdict}
                        </span>
                      </div>
                    </div>
                    <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">이 품목 후보 <span className="font-medium">{data.country.candidate_countries}개국</span> 중 위험 상위 <span className="font-medium">{data.country.risk_percentile}%</span> 수준입니다.</p>
                  </>
                ) : (
                  <>
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
                    <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400">위에서 <span className="font-medium text-blue-600">국가를 선택</span>하면 그 국가의 SGRI를 이 품목 평균과 비교합니다.</p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* 6지표 비교 */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">지표별 상대 위치 (6개)</CardTitle><CardDescription className="mt-1">{indMode === "country" ? `${getCountryName(data.country!.country_code)} 지표값 vs 이 품목 전체국가 평균` : "이 품목 평균 vs 전체 품목 평균"}</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                {indRows.map((ind) => (
                  <div key={ind.key}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700"><span className="mr-1.5 text-xs font-bold text-blue-500">{ind.key}</span>{ind.label}</span>
                      <span className="flex items-center gap-2"><span className="font-semibold text-slate-700">{ind.val}</span><Badge variant="outline" className={`text-[11px] ${verdictCls(ind.verdict)}`}>{ind.delta > 0 ? "+" : ""}{ind.delta}</Badge></span>
                    </div>
                    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${ind.delta >= 5 ? "bg-rose-400" : ind.delta <= -5 ? "bg-emerald-400" : "bg-blue-400"}`} style={{ width: `${Math.min(100, (ind.val / maxScale) * 100)}%` }} />
                      <div className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-slate-500" style={{ left: `${Math.min(100, (ind.base / maxScale) * 100)}%` }} title={`평균 ${ind.base}`} />
                    </div>
                  </div>
                ))}
                <p className="pt-1 text-xs text-slate-400"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-400 align-middle" /> {indMode === "country" ? "이 국가 지표값" : "이 품목 지표값"} · <span className="mx-1 inline-block h-3 w-0.5 bg-slate-500 align-middle" /> {indMode === "country" ? "이 품목 평균" : "전체 품목 평균"} · 오른쪽일수록 위험</p>
              </CardContent>
            </Card>

            <p className="text-center text-xs text-slate-400">기준: {data.basis}</p>
          </div>
        ) : null}
      </main>
    </div>
  )
}
