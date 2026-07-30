"use client"

// 선택한 품목에 적합한 대체 공급국과 공급사를 비교하는 추천 화면입니다.
// 추천 점수와 사유는 현재 데모 값이며 추후 분석 API의 결과를 사용합니다.

import Link from "next/link"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { getCountryName } from "@/lib/countries"
import { ArrowLeft, ArrowRight, Bell, Bot, Building2, Check, CheckCircle2, ChevronDown, CircleAlert, FileText, Globe2, Info, MapPin, ShieldAlert, SlidersHorizontal, Sparkles, Star, Truck, X } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// 화면이 쓰는 데이터 형태 (백엔드 응답을 여기 형태로 매핑)
type CountryRow = { rank: number; code: string; name: string; score: number; sgri: number; unitPrice: number | null; tariff: number | null; leadDays: number | null; description: string; color: string; badge: string }
type SupplierRow = { id: number; name: string; country: string; type: string; match: number; note: string; verified: boolean }

const BADGES = ["가장 추천", "가격 우수", "ESG 우수"]
const COLORS = ["bg-emerald-50 text-emerald-700", "bg-blue-50 text-blue-700", "bg-violet-50 text-violet-700"]

// 백엔드가 아직 안 붙었거나 query_id가 없을 때 보여줄 예시 데이터
const FALLBACK_COUNTRIES: CountryRow[] = [
  { rank: 1, code: "AU", name: "호주", score: 82, sgri: 41, unitPrice: 20.1, tariff: 0, leadDays: 35, description: "지정학 위험이 낮고 공급망이 안정적입니다.", color: COLORS[0], badge: BADGES[0] },
  { rank: 2, code: "CL", name: "칠레", score: 76, sgri: 59, unitPrice: 18.5, tariff: 0, leadDays: 25, description: "가격 경쟁력이 높습니다.", color: COLORS[1], badge: BADGES[1] },
  { rank: 3, code: "CN", name: "중국", score: 72, sgri: 72, unitPrice: 17.8, tariff: 6.5, leadDays: 30, description: "단가가 낮으나 정책 리스크가 큽니다.", color: COLORS[2], badge: BADGES[2] },
]
const FALLBACK_SUPPLIERS: SupplierRow[] = [
  { id: 3, name: "Pilbara Minerals", country: "호주", type: "광산·정제", match: 80, note: "ESG·북미 공급망 선호 기업에 적합", verified: true },
  { id: 1, name: "SQM", country: "칠레", type: "정제·유통", match: 92, note: "가격 경쟁력 및 대량 조달에 강점", verified: true },
  { id: 2, name: "Ganfeng Lithium", country: "중국", type: "정제", match: 84, note: "대량 조달에 강점", verified: true },
]

export default function RecommendationsPage() {
  const [countries, setCountries] = useState<CountryRow[]>(FALLBACK_COUNTRIES)
  const [suppliers, setSuppliers] = useState<SupplierRow[]>(FALLBACK_SUPPLIERS)
  const [selected, setSelected] = useState(FALLBACK_COUNTRIES[0].name)
  const [compared, setCompared] = useState<string[]>([FALLBACK_COUNTRIES[0].name])
  const [feedback, setFeedback] = useState<"good" | "bad" | null>(null)
  const [queryId, setQueryId] = useState<number | null>(null)
  const [itemName, setItemName] = useState("")
  const selectedCountry = countries.find((country) => country.name === selected) ?? countries[0]
  const itemLabel = itemName || "선택 품목"
  const topCountry = countries[0]

  // URL의 ?query_id= 로 실제 추천 데이터를 불러온다. 없거나 실패하면 예시 데이터 유지.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("query_id"))
    if (!id) return
    setQueryId(id)
    api.getQuery(id).then((q) => setItemName(q.item_name ?? "")).catch(() => {})
    api.getCountryRecos(id).then((rows) => {
      if (!rows.length) return
      const mapped: CountryRow[] = rows.map((r, i) => ({
        rank: r.rank,
        code: r.country_code,
        name: getCountryName(r.country_code),
        score: Math.round(Number(r.fit_score ?? 0)),
        sgri: Math.round(Number(r.sgri_score ?? 0)),
        unitPrice: r.est_unit_price != null ? Number(r.est_unit_price) : null,
        tariff: r.tariff_percent != null ? Number(r.tariff_percent) : null,
        leadDays: r.est_lead_days,
        description: r.rationale ?? "",
        color: COLORS[i % COLORS.length],
        badge: BADGES[i % BADGES.length],
      }))
      setCountries(mapped)
      setSelected(mapped[0].name)
      setCompared([mapped[0].name])
    }).catch(() => {})
    api.getSupplierRecos(id).then((rows) => {
      if (!rows.length) return
      setSuppliers(rows.map((r) => ({
        id: r.company.company_id,
        name: r.company.name,
        country: getCountryName(r.company.country_code ?? ""),
        type: (r.company.certifications ?? []).join(", ") || "공급사",
        match: Math.round(Number(r.fit_score ?? 0)),
        note: r.rationale ?? "",
        verified: r.company.status === "active",
      })))
    }).catch(() => {})
  }, [])

  function toggleComparison(country: string) {
    setCompared((current) => current.includes(country) ? current.filter((item) => item !== country) : [...current, country])
  }

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="relative text-slate-600"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div></header>
    <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
      <Link href="/items/new" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 품목 정보 수정</Link>
      <div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><Sparkles className="h-4 w-4" /> AI 추천 결과</div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{itemLabel} 대체 공급처</h1><p className="mt-2 text-sm text-slate-500">조달 후보 <span className="font-medium text-blue-600">{countries.length}개국</span>을 SGRI 위험도 기준으로 비교했습니다.</p></div><Button asChild variant="outline" className="w-fit border-slate-200 bg-white"><Link href="/items/new"><SlidersHorizontal className="mr-2 h-4 w-4" />조건 수정</Link></Button></div>

      <Card className="mt-7 border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 shadow-sm"><CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Bot className="h-5 w-5" /></div><div className="flex-1"><p className="font-semibold">AI 요약: {topCountry ? `${topCountry.name}를 1순위로 검토하세요` : "추천 결과를 확인하세요"}</p><p className="mt-1 text-sm leading-6 text-slate-600">{topCountry ? `${itemLabel} 대체 공급국 중 ${topCountry.name}의 종합 적합도가 ${topCountry.score}점으로 가장 높습니다 (SGRI 위험도 ${topCountry.sgri}점). ${topCountry.description || "리스크·가격·물류·ESG를 종합한 결과입니다."}` : "품목을 등록하면 SGRI 기반 대체 공급국을 추천합니다."}</p></div><Badge className="w-fit border-blue-100 bg-white px-3 py-1.5 text-blue-700 hover:bg-white">{countries.length}개국 비교</Badge></CardContent></Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-3"><div className="space-y-4 xl:col-span-2"><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold">추천 국가 비교</h2><p className="mt-1 text-sm text-slate-500">적합도는 리스크·가격·물류·ESG 항목을 반영합니다.</p></div><span className="text-xs text-slate-400">비교 선택 {compared.length}개</span></div>
        {countries.map((country) => <button onClick={() => setSelected(country.name)} key={country.name} className={`w-full rounded-xl border bg-white p-5 text-left shadow-sm transition-all ${selected === country.name ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200 hover:border-blue-200"}`}><div className="flex flex-wrap items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{country.code}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-base font-semibold">{country.rank}위 {country.name}</span><Badge className={`${country.color} border-0 hover:${country.color}`}>{country.badge}</Badge></div><p className="mt-1 text-sm text-slate-500">{country.description}</p><div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-4"><Score label="SGRI 위험도" value={country.sgri} /><Metric label="예상 단가" value={country.unitPrice != null ? `$${country.unitPrice}` : "-"} /><Metric label="관세" value={country.tariff != null ? `${country.tariff}%` : "-"} /><Metric label="예상 리드타임" value={country.leadDays != null ? `${country.leadDays}일` : "-"} /></div></div><div className="ml-auto flex flex-col items-end gap-3"><div className="text-right"><p className="text-2xl font-semibold text-blue-600">{country.score}</p><p className="text-xs text-slate-400">종합 적합도</p></div><span onClick={(event) => { event.stopPropagation(); toggleComparison(country.name) }} className={`flex cursor-pointer items-center gap-1 text-xs font-medium ${compared.includes(country.name) ? "text-blue-600" : "text-slate-400"}`}><span className={`flex h-4 w-4 items-center justify-center rounded border ${compared.includes(country.name) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"}`}>{compared.includes(country.name) && <Check className="h-3 w-3" />}</span> 비교</span></div></div></button>)}</div>

        <aside className="space-y-6"><Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">{selectedCountry.name} 추천 근거</CardTitle><CardDescription className="mt-1">{itemLabel} 조달 기준</CardDescription></CardHeader><CardContent className="space-y-4"><Reason icon={ShieldAlert} title="공급망 위험도" text={`SGRI 위험도가 ${selectedCountry.sgri}점입니다. (낮을수록 안전)`} /><Reason icon={Truck} title="안정적인 운송 경로" text="주요 항만과 정기 해상 노선이 확보되어 있습니다." /><Reason icon={FileText} title="규제 대응 가능" text="원산지 증빙과 ESG 정보 확인이 비교적 용이합니다." /><Button asChild className="mt-1 w-full bg-blue-600 hover:bg-blue-700"><Link href={`/suppliers/${suppliers[0]?.id ?? 3}${queryId ? `?query_id=${queryId}` : ""}`}>공급사 추천 보기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">이 추천이 도움이 되었나요?</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-500">피드백은 추천 정확도 개선에 활용됩니다.</p><div className="mt-4 flex gap-2"><Button onClick={() => setFeedback("good")} variant={feedback === "good" ? "default" : "outline"} className={feedback === "good" ? "bg-blue-600 hover:bg-blue-700" : "border-slate-200"}>도움 됐어요</Button><Button onClick={() => setFeedback("bad")} variant="outline" className={feedback === "bad" ? "border-rose-200 bg-rose-50 text-rose-600" : "border-slate-200"}>다시 추천받기</Button></div>{feedback && <p className="mt-3 text-xs text-blue-600">피드백이 저장되었습니다. 감사합니다.</p>}</CardContent></Card></aside>
      </div>

      <Card className="mt-7 border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4"><div><CardTitle className="text-base">추천 공급사 후보</CardTitle><CardDescription className="mt-1">공개 데이터와 조달 조건을 기반으로 한 초기 후보입니다.</CardDescription></div><Button variant="outline" size="sm" className="border-slate-200">필터 <ChevronDown className="ml-1 h-3.5 w-3.5" /></Button></CardHeader><CardContent className="grid gap-4 md:grid-cols-3">{suppliers.map((supplier) => <div className="rounded-xl border border-slate-200 p-4" key={supplier.name}><div className="flex items-start justify-between gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Building2 className="h-4 w-4" /></div><Badge className="border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">적합도 {supplier.match}</Badge></div><div className="mt-4 flex items-center gap-1.5"><p className="font-semibold">{supplier.name}</p>{supplier.verified && <CheckCircle2 className="h-4 w-4 text-blue-600" />}</div><p className="mt-1 text-sm text-slate-500">{supplier.country} · {supplier.type}</p><p className="mt-4 min-h-10 text-xs leading-5 text-slate-500">{supplier.note}</p><Button asChild variant="outline" size="sm" className="mt-4 w-full border-slate-200"><Link href={`/suppliers/${supplier.id}${queryId ? `?query_id=${queryId}` : ""}`}>공개 정보 보기</Link></Button></div>)}</CardContent></Card>

      <section className="mt-7 flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center"><div className="flex items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><FileText className="h-4 w-4" /></div><div><p className="font-semibold">대체 공급망 대응 보고서</p><p className="mt-1 text-sm text-slate-500">선택한 국가와 공급사 후보를 반영해 AI 초안을 생성합니다.</p></div></div><Button asChild className="w-fit bg-blue-600 hover:bg-blue-700"><Link href={queryId ? `/reports/new?query_id=${queryId}` : "/reports/new"}>보고서 초안 만들기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></section>
    </main>
  </div>
}

function Score({ label, value, good }: { label: string; value: number; good?: boolean }) { return <div><div className="mb-1 flex items-center justify-between text-xs"><span className="text-slate-500">{label}</span><span className={`font-semibold ${good ? "text-emerald-600" : "text-slate-700"}`}>{value}</span></div><Progress value={value} className="h-1.5" /></div> }
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-700">{value}</p></div> }
function Reason({ icon: Icon, title, text }: { icon: typeof ShieldAlert; title: string; text: string }) { return <div className="flex gap-3"><div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600"><Icon className="h-3.5 w-3.5" /></div><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{text}</p></div></div> }
