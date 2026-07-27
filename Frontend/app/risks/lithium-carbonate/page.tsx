"use client"

// 리튬 탄산염의 위험 점수, 원인, 추이와 대응 방향을 보여주는 품목 상세 화면입니다.
// 현재 특정 품목에 고정된 데모 페이지이며 추후 /risks/[id] 동적 경로로 일반화할 수 있습니다.

import Link from "next/link"
import { useState } from "react"
import { AlertTriangle, ArrowLeft, ArrowRight, Bell, Bot, CheckCircle2, CircleAlert, Clock3, FileText, Globe2, Landmark, MapPin, ShieldAlert, Sparkles, TrendingUp } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

const trend = [
  { date: "7/21", value: 57 }, { date: "7/22", value: 59 }, { date: "7/23", value: 62 },
  { date: "7/24", value: 67 }, { date: "7/25", value: 72 }, { date: "7/26", value: 77 }, { date: "오늘", value: 82 },
]

const components = [
  { label: "공급국 집중도", value: 91, weight: "30%", note: "중국 비중 86%", color: "text-rose-600" },
  { label: "정책·규제 위험", value: 84, weight: "25%", note: "수출 허가 강화 가능성", color: "text-rose-600" },
  { label: "가격 변동성", value: 68, weight: "20%", note: "30일 평균 대비 +8.4%", color: "text-amber-600" },
  { label: "물류·운송 위험", value: 55, weight: "15%", note: "주요 항만 혼잡 보통", color: "text-amber-600" },
  { label: "ESG·탄소 규제", value: 42, weight: "10%", note: "규제 대응 가능", color: "text-emerald-600" },
]

const news = [
  { title: "중국, 흑연·배터리 소재 수출 허가 대상 확대 검토", source: "Reuters", time: "24분 전", impact: "높음", summary: "배터리 핵심 소재에 대한 수출 통제 강화 가능성이 제기돼 조달 리드타임 증가 우려가 있습니다." },
  { title: "중국 리튬 정제 업체, 3분기 출하량 조정 가능성", source: "Bloomberg", time: "3시간 전", impact: "높음", summary: "현지 정제 업체의 생산 조정 전망이 공급 여력 감소 가능성을 시사합니다." },
  { title: "중국발 컨테이너 운임, 2주 연속 상승", source: "Lloyd's List", time: "어제", impact: "보통", summary: "해상 운임 상승으로 단기 조달 비용과 납기 리스크가 확대될 수 있습니다." },
]

export default function RiskDetailPage() {
  const [activeNews, setActiveNews] = useState(0)
  const article = news[activeNews]

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link>
      <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="relative text-slate-600"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div>
    </header>
    <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기</Link>
      <div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-rose-600"><span className="h-2 w-2 rounded-full bg-rose-500" /> 고위험 모니터링</div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">리튬 탄산염 리스크 분석</h1><p className="mt-2 text-sm text-slate-500">HS 2836.91 · 주요 공급국 중국 · 마지막 분석 2026. 07. 27. 15:42</p></div><div className="flex gap-2"><Button asChild variant="outline" className="border-slate-200 bg-white"><Link href="/recommendations"><Globe2 className="mr-2 h-4 w-4" />대체 공급국 보기</Link></Button><Button asChild className="bg-blue-600 hover:bg-blue-700"><Link href="/reports/new"><FileText className="mr-2 h-4 w-4" />보고서 생성</Link></Button></div></div>

      <section className="mt-7 grid gap-5 lg:grid-cols-4"><Card className="border-rose-100 bg-gradient-to-br from-rose-50 to-white shadow-sm"><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-600">SGRI 종합 점수</span><CircleAlert className="h-5 w-5 text-rose-500" /></div><div className="mt-5 flex items-end gap-2"><span className="text-5xl font-semibold tracking-tight text-rose-600">82</span><span className="mb-1 text-sm text-slate-400">/ 100</span></div><div className="mt-4 flex items-center gap-2"><Badge className="border-rose-100 bg-rose-100 text-rose-700 hover:bg-rose-100">고위험</Badge><span className="text-xs font-medium text-rose-600">지난주 대비 +12 <TrendingUp className="inline h-3 w-3" /></span></div><p className="mt-4 border-t border-rose-100 pt-4 text-xs leading-5 text-slate-500">즉시 대체 공급처 검토가 권장되는 수준입니다.</p></CardContent></Card>
        <Card className="border-slate-200 shadow-sm lg:col-span-3"><CardHeader className="pb-2"><CardTitle className="text-base">위험도 추이</CardTitle><CardDescription className="mt-1">최근 7일간 SGRI 변화</CardDescription></CardHeader><CardContent className="pt-3"><div className="h-44"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 5, right: 8, left: -25, bottom: 0 }}><defs><linearGradient id="detailFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#f43f5e" stopOpacity={0.2} /><stop offset="100%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} /><Tooltip contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 10 }} /><Area dataKey="value" name="SGRI" type="monotone" stroke="#f43f5e" strokeWidth={2.5} fill="url(#detailFill)" /></AreaChart></ResponsiveContainer></div></CardContent></Card></section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3"><div className="space-y-6 xl:col-span-2"><Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">SGRI 구성 항목</CardTitle><CardDescription className="mt-1">각 위험 요인의 가중치를 반영한 점수입니다.</CardDescription></CardHeader><CardContent className="space-y-5">{components.map((component) => <div key={component.label}><div className="flex items-center justify-between gap-4"><div><div className="flex items-center gap-2"><p className="text-sm font-medium">{component.label}</p><Badge className="border-slate-100 bg-slate-50 text-[10px] text-slate-500 hover:bg-slate-50">가중치 {component.weight}</Badge></div><p className="mt-1 text-xs text-slate-500">{component.note}</p></div><span className={`text-sm font-semibold ${component.color}`}>{component.value}</span></div><Progress value={component.value} className="mt-2 h-2" /></div>)}</CardContent></Card>
        <Card className="border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3"><div><CardTitle className="text-base">연관 뉴스와 근거</CardTitle><CardDescription className="mt-1">AI가 품목·공급국 관련 이슈를 분류했습니다.</CardDescription></div><Landmark className="h-4 w-4 text-slate-400" /></CardHeader><CardContent className="grid gap-5 md:grid-cols-2"><div className="space-y-1">{news.map((item, index) => <button onClick={() => setActiveNews(index)} key={item.title} className={`w-full rounded-lg border p-3 text-left transition-colors ${activeNews === index ? "border-blue-200 bg-blue-50" : "border-transparent hover:bg-slate-50"}`}><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium leading-5">{item.title}</p><Badge className={`${item.impact === "높음" ? "border-rose-100 bg-rose-50 text-rose-600" : "border-amber-100 bg-amber-50 text-amber-600"} shrink-0 text-[10px] hover:bg-inherit`}>{item.impact}</Badge></div><p className="mt-2 text-xs text-slate-400">{item.source} · {item.time}</p></button>)}</div><div className="rounded-xl border border-slate-200 bg-slate-50 p-5"><div className="flex items-center gap-2 text-xs font-medium text-blue-600"><Sparkles className="h-3.5 w-3.5" /> AI 영향 분석</div><h3 className="mt-3 font-semibold leading-6">{article.title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{article.summary}</p><div className="mt-5 flex items-center gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" /> 공급망 영향 예상: 2~4주 내</div></div></CardContent></Card></div>
        <aside className="space-y-6"><Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-sm"><CardHeader className="pb-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white"><Bot className="h-4 w-4" /></div><CardTitle className="mt-3 text-base">지금 할 일</CardTitle></CardHeader><CardContent className="space-y-3"><Action number="1" title="호주·칠레 공급사 견적 요청" note="대체 공급처 3곳이 추천되었습니다." /><Action number="2" title="안전재고 2주분 확보 검토" note="납기 지연 발생 가능성에 대비합니다." /><Action number="3" title="월간 리스크 보고서 공유" note="구매·생산 부서에 초안을 전달합니다." /><Button asChild className="mt-2 w-full bg-blue-600 hover:bg-blue-700"><Link href="/recommendations">대체 공급처 검토 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card><Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">국가 의존도</CardTitle><CardDescription className="mt-1">최근 12개월 수입 기준</CardDescription></CardHeader><CardContent className="space-y-4"><Country name="중국" value={86} color="bg-rose-500" /><Country name="칠레" value={8} color="bg-blue-500" /><Country name="호주" value={4} color="bg-emerald-500" /><Country name="기타" value={2} color="bg-slate-300" /><p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500"><MapPin className="mr-1 inline h-3.5 w-3.5 text-blue-600" /> 중국 의존도 70% 이하를 1차 목표로 권장합니다.</p></CardContent></Card></aside>
      </div>
    </main>
  </div>
}

function Action({ number, title, note }: { number: string; title: string; note: string }) { return <div className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-blue-600 shadow-sm">{number}</span><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{note}</p></div></div> }
function Country({ name, value, color }: { name: string; value: number; color: string }) { return <div><div className="mb-1.5 flex justify-between text-sm"><span>{name}</span><span className="font-medium">{value}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} /></div></div> }
