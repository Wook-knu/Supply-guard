"use client"

// 선택한 품목에 적합한 대체 공급국과 공급사를 비교하는 추천 화면입니다.
// 추천 점수와 사유는 현재 데모 값이며 추후 분석 API의 결과를 사용합니다.

import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, ArrowRight, Bell, Bot, Building2, Check, CheckCircle2, ChevronDown, CircleAlert, FileText, Globe2, Info, MapPin, ShieldAlert, SlidersHorizontal, Sparkles, Star, Truck, X } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const countries = [
  { rank: 1, name: "호주", code: "AU", score: 82, risk: 28, price: 74, logistics: 80, esg: 88, color: "bg-emerald-50 text-emerald-700", description: "지정학 위험이 낮고 리튬 광산·정제 공급망이 안정적입니다.", badge: "가장 추천" },
  { rank: 2, name: "칠레", code: "CL", score: 76, risk: 35, price: 86, logistics: 68, esg: 73, color: "bg-blue-50 text-blue-700", description: "가격 경쟁력이 높으며 장기 계약 시 단가 협상이 유리합니다.", badge: "가격 우수" },
  { rank: 3, name: "캐나다", code: "CA", score: 72, risk: 24, price: 62, logistics: 71, esg: 92, color: "bg-violet-50 text-violet-700", description: "ESG·탄소 규제 대응력이 높고 FTA 활용이 가능합니다.", badge: "ESG 우수" },
]

const suppliers = [
  { name: "Pilbara Minerals", country: "호주", type: "광산·정제", match: 89, note: "리튬 정광 장기 공급 계약 검토 가능", verified: true },
  { name: "SQM", country: "칠레", type: "정제·유통", match: 84, note: "가격 경쟁력 및 대량 조달에 강점", verified: true },
  { name: "Frontier Lithium", country: "캐나다", type: "광산 개발", match: 78, note: "ESG·북미 공급망 선호 기업에 적합", verified: false },
]

export default function RecommendationsPage() {
  const [selected, setSelected] = useState("호주")
  const [compared, setCompared] = useState<string[]>(["호주"])
  const [feedback, setFeedback] = useState<"good" | "bad" | null>(null)
  const selectedCountry = countries.find((country) => country.name === selected) ?? countries[0]

  function toggleComparison(country: string) {
    setCompared((current) => current.includes(country) ? current.filter((item) => item !== country) : [...current, country])
  }

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="relative text-slate-600"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div></header>
    <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
      <Link href="/items/new" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 품목 정보 수정</Link>
      <div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><Sparkles className="h-4 w-4" /> AI 추천 결과</div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">리튬 탄산염 대체 공급처</h1><p className="mt-2 text-sm text-slate-500">현재 공급국 <span className="font-medium text-rose-600">중국</span>의 SGRI 82점을 기준으로 분석했습니다.</p></div><Button variant="outline" className="w-fit border-slate-200 bg-white"><SlidersHorizontal className="mr-2 h-4 w-4" />조건 수정</Button></div>

      <Card className="mt-7 border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 shadow-sm"><CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Bot className="h-5 w-5" /></div><div className="flex-1"><p className="font-semibold">AI 요약: 호주를 1순위로 검토하세요</p><p className="mt-1 text-sm leading-6 text-slate-600">중국 의존도를 줄이면서 공급 안정성과 ESG 기준을 함께 확보할 수 있습니다. 단, 가격 조건을 보완하려면 칠레 공급사와 병행 협상이 유리합니다.</p></div><Badge className="w-fit border-blue-100 bg-white px-3 py-1.5 text-blue-700 hover:bg-white">분석 신뢰도 91%</Badge></CardContent></Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-3"><div className="space-y-4 xl:col-span-2"><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold">추천 국가 비교</h2><p className="mt-1 text-sm text-slate-500">적합도는 리스크·가격·물류·ESG 항목을 반영합니다.</p></div><span className="text-xs text-slate-400">비교 선택 {compared.length}개</span></div>
        {countries.map((country) => <button onClick={() => setSelected(country.name)} key={country.name} className={`w-full rounded-xl border bg-white p-5 text-left shadow-sm transition-all ${selected === country.name ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200 hover:border-blue-200"}`}><div className="flex flex-wrap items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{country.code}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-base font-semibold">{country.rank}위 {country.name}</span><Badge className={`${country.color} border-0 hover:${country.color}`}>{country.badge}</Badge></div><p className="mt-1 text-sm text-slate-500">{country.description}</p><div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-4"><Score label="공급 안정성" value={100 - country.risk} good /><Score label="가격 경쟁력" value={country.price} /><Score label="물류 효율" value={country.logistics} /><Score label="ESG 적합성" value={country.esg} /></div></div><div className="ml-auto flex flex-col items-end gap-3"><div className="text-right"><p className="text-2xl font-semibold text-blue-600">{country.score}</p><p className="text-xs text-slate-400">종합 적합도</p></div><span onClick={(event) => { event.stopPropagation(); toggleComparison(country.name) }} className={`flex cursor-pointer items-center gap-1 text-xs font-medium ${compared.includes(country.name) ? "text-blue-600" : "text-slate-400"}`}><span className={`flex h-4 w-4 items-center justify-center rounded border ${compared.includes(country.name) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"}`}>{compared.includes(country.name) && <Check className="h-3 w-3" />}</span> 비교</span></div></div></button>)}</div>

        <aside className="space-y-6"><Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">{selectedCountry.name} 추천 근거</CardTitle><CardDescription className="mt-1">리튬 탄산염 조달 기준</CardDescription></CardHeader><CardContent className="space-y-4"><Reason icon={ShieldAlert} title="낮은 공급망 위험" text={`SGRI 위험도가 ${selectedCountry.risk}점으로 현재 공급국보다 낮습니다.`} /><Reason icon={Truck} title="안정적인 운송 경로" text="주요 항만과 정기 해상 노선이 확보되어 있습니다." /><Reason icon={FileText} title="규제 대응 가능" text="원산지 증빙과 ESG 정보 확인이 비교적 용이합니다." /><Button asChild className="mt-1 w-full bg-blue-600 hover:bg-blue-700"><Link href="/suppliers/pilbara-minerals">공급사 추천 보기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">이 추천이 도움이 되었나요?</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-500">피드백은 추천 정확도 개선에 활용됩니다.</p><div className="mt-4 flex gap-2"><Button onClick={() => setFeedback("good")} variant={feedback === "good" ? "default" : "outline"} className={feedback === "good" ? "bg-blue-600 hover:bg-blue-700" : "border-slate-200"}>도움 됐어요</Button><Button onClick={() => setFeedback("bad")} variant="outline" className={feedback === "bad" ? "border-rose-200 bg-rose-50 text-rose-600" : "border-slate-200"}>다시 추천받기</Button></div>{feedback && <p className="mt-3 text-xs text-blue-600">피드백이 저장되었습니다. 감사합니다.</p>}</CardContent></Card></aside>
      </div>

      <Card className="mt-7 border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4"><div><CardTitle className="text-base">추천 공급사 후보</CardTitle><CardDescription className="mt-1">공개 데이터와 조달 조건을 기반으로 한 초기 후보입니다.</CardDescription></div><Button variant="outline" size="sm" className="border-slate-200">필터 <ChevronDown className="ml-1 h-3.5 w-3.5" /></Button></CardHeader><CardContent className="grid gap-4 md:grid-cols-3">{suppliers.map((supplier) => <div className="rounded-xl border border-slate-200 p-4" key={supplier.name}><div className="flex items-start justify-between gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Building2 className="h-4 w-4" /></div><Badge className="border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">적합도 {supplier.match}</Badge></div><div className="mt-4 flex items-center gap-1.5"><p className="font-semibold">{supplier.name}</p>{supplier.verified && <CheckCircle2 className="h-4 w-4 text-blue-600" />}</div><p className="mt-1 text-sm text-slate-500">{supplier.country} · {supplier.type}</p><p className="mt-4 min-h-10 text-xs leading-5 text-slate-500">{supplier.note}</p><Button variant="outline" size="sm" className="mt-4 w-full border-slate-200">공개 정보 보기</Button></div>)}</CardContent></Card>

      <section className="mt-7 flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center"><div className="flex items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><FileText className="h-4 w-4" /></div><div><p className="font-semibold">대체 공급망 대응 보고서</p><p className="mt-1 text-sm text-slate-500">선택한 국가와 공급사 후보를 반영해 AI 초안을 생성합니다.</p></div></div><Button asChild className="w-fit bg-blue-600 hover:bg-blue-700"><Link href="/reports/new">보고서 초안 만들기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></section>
    </main>
  </div>
}

function Score({ label, value, good }: { label: string; value: number; good?: boolean }) { return <div><div className="mb-1 flex items-center justify-between text-xs"><span className="text-slate-500">{label}</span><span className={`font-semibold ${good ? "text-emerald-600" : "text-slate-700"}`}>{value}</span></div><Progress value={value} className="h-1.5" /></div> }
function Reason({ icon: Icon, title, text }: { icon: typeof ShieldAlert; title: string; text: string }) { return <div className="flex gap-3"><div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600"><Icon className="h-3.5 w-3.5" /></div><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{text}</p></div></div> }
