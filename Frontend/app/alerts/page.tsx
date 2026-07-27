"use client"

// 공급망 알림 목록을 필터링하고 읽음 상태를 관리하는 클라이언트 화면입니다.
// initialAlerts는 백엔드 연결 전 사용하는 데모 데이터이며 추후 알림 API 응답으로 교체합니다.

import Link from "next/link"
import { useState } from "react"
import { AlertTriangle, ArrowLeft, ArrowRight, Bell, Check, CheckCheck, CircleAlert, Clock3, FileText, Globe2, Landmark, ShieldAlert, SlidersHorizontal } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const initialAlerts = [
  { id: 1, title: "리튬 탄산염 위험도 상승", description: "중국 수출 규제 관련 이슈로 SGRI 점수가 70에서 82로 상승했습니다.", time: "24분 전", level: "high", source: "정책·규제 분석", href: "/risks/lithium-carbonate", unread: true },
  { id: 2, title: "대만발 차량용 MCU 선적 지연", description: "해상 악천후로 인해 예정 선적 일정이 평균 3~5일 지연될 수 있습니다.", time: "2시간 전", level: "high", source: "물류 동향", href: "/risks/lithium-carbonate", unread: true },
  { id: 3, title: "호주 공급사 신규 추천", description: "리튬 탄산염의 대체 공급처로 Pilbara Minerals가 새 후보로 등록되었습니다.", time: "5시간 전", level: "recommend", source: "AI 공급사 추천", href: "/suppliers/pilbara-minerals", unread: true },
  { id: 4, title: "7월 공급망 리스크 보고서 생성 완료", description: "리튬 탄산염 분석 결과를 반영한 사내 검토용 초안이 준비되었습니다.", time: "어제", level: "report", source: "AI 보고서", href: "/reports/july-lithium-risk", unread: false },
  { id: 5, title: "인도네시아 황산니켈 위험도 하락", description: "항만 혼잡 완화와 생산량 전망 개선으로 위험도가 안정 단계로 변경되었습니다.", time: "어제", level: "stable", source: "시장·물류 분석", href: "/", unread: false },
]

const config = {
  high: { label: "고위험", color: "border-rose-100 bg-rose-50 text-rose-700", icon: AlertTriangle, iconColor: "bg-rose-100 text-rose-600" },
  recommend: { label: "추천", color: "border-blue-100 bg-blue-50 text-blue-700", icon: Globe2, iconColor: "bg-blue-100 text-blue-600" },
  report: { label: "보고서", color: "border-violet-100 bg-violet-50 text-violet-700", icon: FileText, iconColor: "bg-violet-100 text-violet-600" },
  stable: { label: "안정", color: "border-emerald-100 bg-emerald-50 text-emerald-700", icon: Check, iconColor: "bg-emerald-100 text-emerald-600" },
}

export default function AlertsPage() {
  // 현재는 읽음 여부를 메모리에서만 관리하므로 새로고침하면 초기 상태로 돌아갑니다.
  const [alerts, setAlerts] = useState(initialAlerts)
  const [filter, setFilter] = useState("all")
  const visible = alerts.filter((alert) => filter === "all" || (filter === "unread" && alert.unread) || (filter === "risk" && alert.level === "high"))
  const unread = alerts.filter((alert) => alert.unread).length
  const markAllRead = () => setAlerts((current) => current.map((alert) => ({ ...alert, unread: false })))
  const markRead = (id: number) => setAlerts((current) => current.map((alert) => alert.id === id ? { ...alert, unread: false } : alert))

  return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="relative text-blue-600"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div></header>
    <main className="mx-auto max-w-5xl px-5 py-8 md:px-8"><Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기</Link><div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><Bell className="h-4 w-4" /> 알림센터</div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">새로운 공급망 변화 {unread > 0 && <span className="text-rose-600">{unread}건</span>}</h1><p className="mt-2 text-sm text-slate-500">품목, 공급국, 뉴스 분석 결과를 바탕으로 중요한 변화를 알려드립니다.</p></div><Button onClick={markAllRead} variant="outline" className="w-fit border-slate-200"><CheckCheck className="mr-2 h-4 w-4" />모두 읽음 처리</Button></div>
      <div className="mt-7 grid gap-6 lg:grid-cols-3"><section className="space-y-4 lg:col-span-2"><div className="flex items-center justify-between"><Tabs defaultValue="all" className="w-auto"><TabsList className="bg-slate-100"><TabsTrigger value="all" onClick={() => setFilter("all")}>전체</TabsTrigger><TabsTrigger value="unread" onClick={() => setFilter("unread")}>읽지 않음 {unread > 0 && <span className="ml-1 text-blue-600">{unread}</span>}</TabsTrigger><TabsTrigger value="risk" onClick={() => setFilter("risk")}>고위험</TabsTrigger></TabsList></Tabs><Button variant="ghost" size="sm" className="text-slate-500"><SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />필터</Button></div><Card className="overflow-hidden border-slate-200 shadow-sm"><CardContent className="p-0">{visible.length ? visible.map((alert) => { const item = config[alert.level as keyof typeof config]; const Icon = item.icon; return <div key={alert.id} className={`flex gap-4 border-b border-slate-100 p-5 last:border-0 ${alert.unread ? "bg-blue-50/30" : "bg-white"}`}><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.iconColor}`}><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Link onClick={() => markRead(alert.id)} href={alert.href} className="font-semibold hover:text-blue-600">{alert.title}</Link>{alert.unread && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}<Badge className={`${item.color} border text-[10px] hover:bg-inherit`}>{item.label}</Badge></div><p className="mt-1.5 text-sm leading-6 text-slate-600">{alert.description}</p><div className="mt-3 flex items-center gap-3 text-xs text-slate-400"><span>{alert.source}</span><span>·</span><span>{alert.time}</span></div></div><Button asChild onClick={() => markRead(alert.id)} variant="ghost" size="icon" className="h-8 w-8 shrink-0"><Link href={alert.href}><ArrowRight className="h-4 w-4" /></Link></Button></div> }) : <div className="p-12 text-center text-sm text-slate-500"><CheckCheck className="mx-auto mb-3 h-8 w-8 text-emerald-500" />표시할 알림이 없습니다.</div>}</CardContent></Card></section>
        <aside className="space-y-5"><Card className="border-rose-100 bg-gradient-to-br from-rose-50 to-white shadow-sm"><CardHeader className="pb-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-600"><CircleAlert className="h-4 w-4" /></div><CardTitle className="mt-3 text-base">즉시 확인 필요</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-slate-600">리튬 탄산염의 위험도가 고위험 단계로 상승했습니다. 대체 공급국 검토를 시작하세요.</p><Button asChild className="mt-4 w-full bg-blue-600 hover:bg-blue-700"><Link href="/risks/lithium-carbonate">리스크 상세 보기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card><Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">알림 기준</CardTitle><CardDescription className="mt-1">현재 설정된 모니터링 조건</CardDescription></CardHeader><CardContent className="space-y-4"><Rule label="고위험 경보" value="SGRI 70점 이상" /><Rule label="뉴스 경보" value="영향도 높음 이슈" /><Rule label="보고서 알림" value="월간 자동 생성" /><Button variant="outline" className="w-full border-slate-200">알림 설정 관리</Button></CardContent></Card></aside>
      </div>
    </main>
  </div>
}

function Rule({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between text-sm"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-800">{value}</span></div> }
