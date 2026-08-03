"use client"

// 품목(HS 코드)별 SGRI 리스크 상세 — /risks/{hsCode} 동적 경로.
// 실데이터: GET /risks?hs_code=… (국가별 6지표 S·C·V·L·P·E + 종합 SGRI)

import Link from "next/link"
import { use, useEffect, useMemo, useState } from "react"
import { ArrowLeft, ArrowRight, Bell, Bot, CircleAlert, FileText, Globe2, ShieldAlert, TrendingUp } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { api, type RiskOut } from "@/lib/api"
import { getCountryName } from "@/lib/countries"

// HS 코드 → 품목명 (알려진 품목만; 없으면 코드 표기)
const HS_NAME: Record<string, string> = { "283691": "리튬 탄산염" }

// 6지표 메타 (표시 순서·라벨)
const INDICATORS: { key: keyof RiskOut; label: string; note: string }[] = [
  { key: "score_c", label: "공급국 집중도", note: "특정국 편중(HHI 기반)" },
  { key: "score_p", label: "국가·정책 위험", note: "거버넌스·규제 지표" },
  { key: "score_s", label: "수급 불안정성", note: "수입량 변동계수" },
  { key: "score_v", label: "가격 변동성", note: "원자재·환율 변동" },
  { key: "score_l", label: "물류·운송 위험", note: "항만·물류 성과" },
  { key: "score_e", label: "ESG·탄소 규제", note: "배출계수 기반" },
]

function num(v: string | null): number { return Math.round(Number(v ?? 0)) }
function levelOf(score: number): "high" | "medium" | "low" { return score >= 50 ? "high" : score >= 25 ? "medium" : "low" }
function toneOf(score: number): string { return score >= 50 ? "text-rose-600" : score >= 25 ? "text-amber-600" : "text-emerald-600" }
const LEVEL_LABEL = { high: "고위험", medium: "주의", low: "안정" }

export default function RiskDetailPage({ params }: { params: Promise<{ hsCode: string }> }) {
  const { hsCode } = use(params)
  const [rows, setRows] = useState<RiskOut[]>([])
  const [loaded, setLoaded] = useState(false)
  const [queryId, setQueryId] = useState<number | null>(null)
  const [queryName, setQueryName] = useState<string | null>(null)

  useEffect(() => {
    api.getRisks(hsCode)
      .then((data) => setRows(data))
      .catch(() => setRows([]))
      .finally(() => setLoaded(true))
    // 이 HS로 등록된 내 품목을 찾아 query_id를 확보(추천·보고서 링크에 사용)
    api.getQueries()
      .then((qs) => {
        const q = qs.find((row) => (row.hs_code ?? "") === hsCode)
        setQueryId(q?.query_id ?? null)
        setQueryName(q?.item_name?.trim() || null)
      })
      .catch(() => {})
  }, [hsCode])

  // 추천/보고서 링크(query_id 있으면 붙임)
  const recoHref = queryId != null ? `/recommendations?query_id=${queryId}` : "/recommendations"
  const reportHref = queryId != null ? `/reports/new?query_id=${queryId}` : "/reports/new"
  const itemName = queryName ?? HS_NAME[hsCode] ?? `HS ${hsCode}`
  // 국가를 SGRI 높은 순으로 정렬, 최고 위험국을 대표로 사용
  const ranked = useMemo(() => [...rows].sort((a, b) => num(b.sgri_score) - num(a.sgri_score)), [rows])
  const worst = ranked[0]
  const topScore = worst ? num(worst.sgri_score) : 0
  const topLevel = levelOf(topScore)

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link>
      <div className="flex items-center gap-3"><Button asChild variant="ghost" size="icon" className="relative text-slate-600"><Link href="/alerts"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Link></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div>
    </header>
    <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기</Link>
      <div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className={`mb-2 flex items-center gap-2 text-sm font-medium ${toneOf(topScore)}`}><span className={`h-2 w-2 rounded-full ${topLevel === "high" ? "bg-rose-500" : topLevel === "medium" ? "bg-amber-500" : "bg-emerald-500"}`} /> {LEVEL_LABEL[topLevel]} 모니터링</div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{itemName} 리스크 분석</h1>
          <p className="mt-2 text-sm text-slate-500">HS {hsCode} · 분석 대상 공급국 {rows.length}개국{worst ? ` · 최고 위험국 ${getCountryName(worst.country_code)}` : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="border-slate-200 bg-white"><Link href={recoHref}><Globe2 className="mr-2 h-4 w-4" />대체 공급국·기업 추천</Link></Button>
          <Button asChild className="bg-blue-600 hover:bg-blue-700"><Link href={reportHref}><FileText className="mr-2 h-4 w-4" />보고서 초안 생성</Link></Button>
        </div>
      </div>

      {!loaded ? <p className="mt-16 text-center text-sm text-slate-400">불러오는 중…</p>
        : rows.length === 0 ? <div className="mt-16 text-center text-sm text-slate-500">해당 품목의 위험 데이터가 없습니다.<div className="mt-3"><Button asChild variant="outline"><Link href="/dashboard">대시보드로</Link></Button></div></div>
        : <>
        <section className="mt-7 grid gap-5 lg:grid-cols-4">
          <Card className={`shadow-sm ${topLevel === "high" ? "border-rose-100 bg-gradient-to-br from-rose-50 to-white" : topLevel === "medium" ? "border-amber-100 bg-gradient-to-br from-amber-50 to-white" : "border-emerald-100 bg-gradient-to-br from-emerald-50 to-white"}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-600">최고 SGRI ({worst ? getCountryName(worst.country_code) : "-"})</span><CircleAlert className={`h-5 w-5 ${toneOf(topScore)}`} /></div>
              <div className="mt-5 flex items-end gap-2"><span className={`text-5xl font-semibold tracking-tight ${toneOf(topScore)}`}>{topScore}</span><span className="mb-1 text-sm text-slate-400">/ 100</span></div>
              <div className="mt-4"><Badge className={`border ${topLevel === "high" ? "border-rose-100 bg-rose-100 text-rose-700 hover:bg-rose-100" : topLevel === "medium" ? "border-amber-100 bg-amber-100 text-amber-700 hover:bg-amber-100" : "border-emerald-100 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"}`}>{LEVEL_LABEL[topLevel]}</Badge></div>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">{topLevel === "high" ? "즉시 대체 공급처 검토가 권장되는 수준입니다." : topLevel === "medium" ? "주기적 모니터링과 대체 후보 확보를 권장합니다." : "현재 안정 범위이나 변동을 지켜보세요."}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm lg:col-span-3">
            <CardHeader className="pb-2"><CardTitle className="text-base">SGRI 구성 항목 — {worst ? getCountryName(worst.country_code) : ""}</CardTitle><CardDescription className="mt-1">6개 지표(공식 산출)의 최고 위험국 점수입니다.</CardDescription></CardHeader>
            <CardContent className="grid gap-x-8 gap-y-5 pt-3 sm:grid-cols-2">
              {INDICATORS.map((ind) => {
                const v = worst ? num(worst[ind.key] as string | null) : 0
                return <div key={ind.key}>
                  <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">{ind.label}</p><p className="mt-0.5 text-xs text-slate-500">{ind.note}</p></div><span className={`text-sm font-semibold ${toneOf(v)}`}>{v}</span></div>
                  <Progress value={v} className="mt-2 h-2" />
                </div>
              })}
            </CardContent>
          </Card>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <Card className="border-slate-200 shadow-sm xl:col-span-2">
            <CardHeader className="pb-3"><CardTitle className="text-base">공급국 위험 순위</CardTitle><CardDescription className="mt-1">SGRI가 높은(위험한) 순서입니다.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {ranked.map((r, i) => { const s = num(r.sgri_score); const lv = levelOf(s); return <div key={r.country_code} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{i + 1}</span>
                <span className="w-10 shrink-0 text-[11px] font-bold text-slate-500">{r.country_code}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{getCountryName(r.country_code)}</span>
                <Badge className={`border text-[10px] ${lv === "high" ? "border-rose-100 bg-rose-50 text-rose-600" : lv === "medium" ? "border-amber-100 bg-amber-50 text-amber-600" : "border-emerald-100 bg-emerald-50 text-emerald-600"} hover:bg-inherit`}>{LEVEL_LABEL[lv]}</Badge>
                <span className={`w-8 text-right text-sm font-semibold ${toneOf(s)}`}>{s}</span>
              </div> })}
            </CardContent>
          </Card>
          <aside className="space-y-6">
            <Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-sm">
              <CardHeader className="pb-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white"><Bot className="h-4 w-4" /></div><CardTitle className="mt-3 text-base">지금 할 일</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Action number="1" title="저위험 공급국 견적 요청" note={`${ranked.filter((r) => levelOf(num(r.sgri_score)) === "low").length}개국이 안정 범위입니다.`} />
                <Action number="2" title="안전재고 확보 검토" note="납기 지연 가능성에 대비합니다." />
                <Action number="3" title="리스크 보고서 공유" note="구매·생산 부서에 초안을 전달합니다." />
                <Button asChild className="mt-2 w-full bg-blue-600 hover:bg-blue-700"><Link href={recoHref}>대체 공급처 검토 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">요약</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">분석 공급국</span><span className="font-medium">{rows.length}개국</span></div>
                <div className="flex justify-between"><span className="text-slate-500">고위험(50+)</span><span className="font-medium text-rose-600">{ranked.filter((r) => num(r.sgri_score) >= 50).length}개국</span></div>
                <div className="flex justify-between"><span className="text-slate-500">안정(25 미만)</span><span className="font-medium text-emerald-600">{ranked.filter((r) => num(r.sgri_score) < 25).length}개국</span></div>
                <p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500"><TrendingUp className="mr-1 inline h-3.5 w-3.5 text-blue-600" /> 최고 위험국 대비 안정 공급국으로의 다변화를 권장합니다.</p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </>}
    </main>
  </div>
}

function Action({ number, title, note }: { number: string; title: string; note: string }) { return <div className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-blue-600 shadow-sm">{number}</span><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{note}</p></div></div> }
