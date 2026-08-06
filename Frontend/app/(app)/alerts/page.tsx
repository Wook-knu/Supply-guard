"use client"

// 공급망 알림 목록을 필터링하고 읽음 상태를 관리하는 클라이언트 화면입니다.
// 알림은 실제 /alerts API 응답으로만 채운다(가짜 데모 데이터 제거, 로딩·빈 상태 표시).

import Link from "next/link"
import BackLink from "@/components/back-link"
import { useEffect, useState } from "react"
import { AlertTriangle, ArrowLeft, ArrowRight, Bell, Check, CheckCheck, CircleAlert, Clock3, FileText, Globe2, Landmark, ShieldAlert, SlidersHorizontal } from "lucide-react"
import { api } from "@/lib/api"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const config = {
  high: { label: "고위험", color: "border-rose-100 bg-rose-50 text-rose-700", icon: AlertTriangle, iconColor: "bg-rose-100 text-rose-600" },
  medium: { label: "주의", color: "border-amber-100 bg-amber-50 text-amber-700", icon: CircleAlert, iconColor: "bg-amber-100 text-amber-600" },
  low: { label: "안정", color: "border-emerald-100 bg-emerald-50 text-emerald-700", icon: Check, iconColor: "bg-emerald-100 text-emerald-600" },
  recommend: { label: "추천", color: "border-blue-100 bg-blue-50 text-blue-700", icon: Globe2, iconColor: "bg-blue-100 text-blue-600" },
  report: { label: "보고서", color: "border-violet-100 bg-violet-50 text-violet-700", icon: FileText, iconColor: "bg-violet-100 text-violet-600" },
  stable: { label: "안정", color: "border-emerald-100 bg-emerald-50 text-emerald-700", icon: Check, iconColor: "bg-emerald-100 text-emerald-600" },
}

type UiAlert = { id: number; title: string; description: string; time: string; level: string; source: string; href: string; external: boolean; unread: boolean }

function relTime(iso: string | null): string {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "방금 전"
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<UiAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")

  // 백엔드 /alerts 를 불러와 화면 형태로 매핑. 없으면 빈 상태를 보여준다(가짜 데이터 없음).
  useEffect(() => {
    api.getAlerts().then((rows) => {
      setAlerts(rows.map((a) => ({
        id: a.alert_id,
        title: a.title ?? "알림",
        description: a.message ?? "",
        time: relTime(a.created_at),
        level: (a.severity as string) || "medium",
        source: a.alert_type ?? "공급망 분석",
        // 관련 뉴스 링크 우선, 없으면 해당 품목 리스크 상세. (대체공급처로 보내지 않음)
        href: a.source_url ?? (a.hs_code ? `/risks/${a.hs_code}` : "#"),
        external: Boolean(a.source_url),
        unread: !a.is_read,
      })))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const visible = alerts.filter((alert) => filter === "all" || (filter === "unread" && alert.unread) || (filter === "risk" && alert.level === "high"))
  const unread = alerts.filter((alert) => alert.unread).length
  // '즉시 확인 필요' 카드에 쓸 최상위 고위험 알림(없으면 카드 숨김)
  const topHigh = alerts.find((a) => a.level === "high" && a.unread) ?? alerts.find((a) => a.level === "high")

  const markRead = (id: number) => {
    setAlerts((current) => current.map((alert) => alert.id === id ? { ...alert, unread: false } : alert))
    api.markAlertRead(id).catch(() => {}) // 낙관적 업데이트: 실패해도 화면은 유지
  }
  const markAllRead = () => {
    const unreadIds = alerts.filter((a) => a.unread).map((a) => a.id)
    setAlerts((current) => current.map((alert) => ({ ...alert, unread: false })))
    unreadIds.forEach((id) => api.markAlertRead(id).catch(() => {}))
  }

  return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="relative text-blue-600"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div></header>
    <main className="mx-auto max-w-5xl px-5 py-8 md:px-8"><BackLink /><div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><Bell className="h-4 w-4" /> 알림센터</div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">새로운 공급망 변화 {unread > 0 && <span className="text-rose-600">{unread}건</span>}</h1><p className="mt-2 text-sm text-slate-500">품목, 공급국, 뉴스 분석 결과를 바탕으로 중요한 변화를 알려드립니다.</p></div><Button onClick={markAllRead} variant="outline" className="w-fit border-slate-200"><CheckCheck className="mr-2 h-4 w-4" />모두 읽음 처리</Button></div>
      <div className="mt-7 grid gap-6 lg:grid-cols-3"><section className="space-y-4 lg:col-span-2"><div className="flex items-center justify-between"><Tabs defaultValue="all" className="w-auto"><TabsList className="bg-slate-100"><TabsTrigger value="all" onClick={() => setFilter("all")}>전체</TabsTrigger><TabsTrigger value="unread" onClick={() => setFilter("unread")}>읽지 않음 {unread > 0 && <span className="ml-1 text-blue-600">{unread}</span>}</TabsTrigger><TabsTrigger value="risk" onClick={() => setFilter("risk")}>고위험</TabsTrigger></TabsList></Tabs><Button variant="ghost" size="sm" className="text-slate-500"><SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />필터</Button></div><Card className="overflow-hidden border-slate-200 shadow-sm"><CardContent className="p-0">{loading ? <div className="p-12 text-center text-sm text-slate-400">알림을 불러오는 중…</div> : visible.length ? visible.map((alert) => { const item = config[alert.level as keyof typeof config] ?? config.medium; const Icon = item.icon; return <div key={alert.id} className={`flex gap-4 border-b border-slate-100 p-5 last:border-0 ${alert.unread ? "bg-blue-50/30" : "bg-white"}`}><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.iconColor}`}><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2">{alert.external ? <a onClick={() => markRead(alert.id)} href={alert.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold hover:text-blue-600">{alert.title}<Globe2 className="h-3.5 w-3.5 text-slate-400" /></a> : <Link onClick={() => markRead(alert.id)} href={alert.href} className="font-semibold hover:text-blue-600">{alert.title}</Link>}{alert.unread && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}<Badge className={`${item.color} border text-[10px] hover:bg-inherit`}>{item.label}</Badge></div><p className="mt-1.5 text-sm leading-6 text-slate-600">{alert.description}</p><div className="mt-3 flex items-center gap-3 text-xs text-slate-400"><span>{alert.source}</span><span>·</span><span>{alert.time}</span></div></div><Button asChild onClick={() => markRead(alert.id)} variant="ghost" size="icon" className="h-8 w-8 shrink-0">{alert.external ? <a href={alert.href} target="_blank" rel="noreferrer"><ArrowRight className="h-4 w-4" /></a> : <Link href={alert.href}><ArrowRight className="h-4 w-4" /></Link>}</Button></div> }) : <div className="p-12 text-center text-sm text-slate-500"><CheckCheck className="mx-auto mb-3 h-8 w-8 text-emerald-500" />표시할 알림이 없습니다.</div>}</CardContent></Card></section>
        <aside className="space-y-5">{topHigh && <Card className="border-rose-100 bg-gradient-to-br from-rose-50 to-white shadow-sm"><CardHeader className="pb-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-600"><CircleAlert className="h-4 w-4" /></div><CardTitle className="mt-3 text-base">즉시 확인 필요</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-slate-600">{topHigh.description || topHigh.title}</p><Button asChild className="mt-4 w-full bg-blue-600 hover:bg-blue-700">{topHigh.external ? <a href={topHigh.href} target="_blank" rel="noreferrer">리스크 상세 보기 <ArrowRight className="ml-2 h-4 w-4" /></a> : <Link href={topHigh.href}>리스크 상세 보기 <ArrowRight className="ml-2 h-4 w-4" /></Link>}</Button></CardContent></Card>}<Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">알림 기준</CardTitle><CardDescription className="mt-1">현재 설정된 모니터링 조건</CardDescription></CardHeader><CardContent className="space-y-4"><Rule label="고위험 경보" value="SGRI 70점 이상" /><Rule label="뉴스 경보" value="영향도 높음 이슈" /><Rule label="보고서 알림" value="월간 자동 생성" /><Button variant="outline" className="w-full border-slate-200">알림 설정 관리</Button></CardContent></Card></aside>
      </div>
    </main>
  </div>
}

function Rule({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between text-sm"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-800">{value}</span></div> }
