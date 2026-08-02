"use client"

// 로그인 사용자의 실제 알림과 저장된 알림 기준만 표시한다.

import Link from "next/link"
import { useEffect, useState } from "react"
import { AlertTriangle, ArrowLeft, ArrowRight, Bell, Check, CheckCheck, CircleAlert, FileText, Globe2, ShieldAlert } from "lucide-react"
import { api, type AlertSettings } from "@/lib/api"
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

type UiAlert = {
  id: number
  title: string
  description: string
  time: string
  level: string
  source: string
  href: string
  external: boolean
  unread: boolean
}

const defaultSettings: AlertSettings = {
  high_risk: true,
  news: true,
  monthly_report: true,
  high_threshold: 70,
}

function relTime(iso: string | null): string {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "방금 전"
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<UiAlert[]>([])
  const [filter, setFilter] = useState("all")
  const [loadError, setLoadError] = useState("")
  const [settings, setSettings] = useState<AlertSettings>(defaultSettings)

  useEffect(() => {
    Promise.all([api.getAlerts(), api.getAlertSettings().catch(() => defaultSettings)])
      .then(([rows, savedSettings]) => {
        setLoadError("")
        setSettings(savedSettings)
        setAlerts(rows.map((alert) => ({
          id: alert.alert_id,
          title: alert.title ?? "알림",
          description: alert.message ?? "",
          time: relTime(alert.created_at),
          level: alert.severity || "medium",
          source: alert.alert_type ?? "공급망 분석",
          href: alert.source_url?.trim() || (alert.query_id ? `/recommendations?query_id=${alert.query_id}` : "/items"),
          external: Boolean(alert.source_url?.trim()),
          unread: !alert.is_read,
        })))
      })
      .catch(() => setLoadError("알림을 불러오지 못했습니다. 네트워크 연결 후 다시 확인해 주세요."))
  }, [])

  const visible = alerts.filter((alert) => filter === "all" || (filter === "unread" && alert.unread) || (filter === "risk" && alert.level === "high"))
  const unread = alerts.filter((alert) => alert.unread).length
  const priorityAlert = alerts.find((alert) => alert.level === "high")

  const markRead = (id: number) => {
    setAlerts((current) => current.map((alert) => alert.id === id ? { ...alert, unread: false } : alert))
    api.markAlertRead(id).catch(() => {})
  }

  const markAllRead = () => {
    const unreadIds = alerts.filter((alert) => alert.unread).map((alert) => alert.id)
    setAlerts((current) => current.map((alert) => ({ ...alert, unread: false })))
    unreadIds.forEach((id) => api.markAlertRead(id).catch(() => {}))
  }

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <Link href="/dashboard" className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></span>
        <span className="font-semibold tracking-tight">SupplyGuard</span>
      </Link>
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="relative text-blue-600"><Link href="/alerts" aria-label="현재 알림 페이지" aria-current="page"><Bell className="h-4 w-4" />{unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />}</Link></Button>
        <Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar>
      </div>
    </header>

    <main className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기</Link>
      <div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><Bell className="h-4 w-4" /> 알림센터</div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">새로운 공급망 변화 {unread > 0 && <span className="text-rose-600">{unread}건</span>}</h1>
          <p className="mt-2 text-sm text-slate-500">품목, 공급국, 뉴스 분석 결과를 바탕으로 중요한 변화를 알려드립니다.</p>
        </div>
        <Button onClick={markAllRead} disabled={unread === 0} variant="outline" className="w-fit border-slate-200"><CheckCheck className="mr-2 h-4 w-4" />모두 읽음 처리</Button>
      </div>

      <div className="mt-7 grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={filter} onValueChange={setFilter} className="w-auto"><TabsList className="bg-slate-100"><TabsTrigger value="all">전체</TabsTrigger><TabsTrigger value="unread">읽지 않음 {unread > 0 && <span className="ml-1 text-blue-600">{unread}</span>}</TabsTrigger><TabsTrigger value="risk">고위험</TabsTrigger></TabsList></Tabs>
            <Button asChild variant="ghost" size="sm" className="w-fit text-slate-500"><Link href="/settings?tab=alerts">알림 기준 설정</Link></Button>
          </div>
          {loadError && <p role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{loadError}</p>}
          <Card className="overflow-hidden border-slate-200 shadow-sm"><CardContent className="p-0">
            {visible.length ? visible.map((alert) => {
              const item = config[alert.level as keyof typeof config] ?? config.medium
              const Icon = item.icon
              return <div key={alert.id} className={`flex gap-4 border-b border-slate-100 p-5 last:border-0 ${alert.unread ? "bg-blue-50/30" : "bg-white"}`}>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.iconColor}`}><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Link onClick={() => markRead(alert.id)} href={alert.href} target={alert.external ? "_blank" : undefined} rel={alert.external ? "noopener noreferrer" : undefined} className="font-semibold hover:text-blue-600">{alert.title}</Link>{alert.unread && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}<Badge className={`${item.color} border text-[10px] hover:bg-inherit`}>{item.label}</Badge></div>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">{alert.description}</p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-400"><span>{alert.source}</span><span>·</span><span>{alert.time}</span></div>
                </div>
                <Button asChild onClick={() => markRead(alert.id)} variant="ghost" size="icon" className="h-8 w-8 shrink-0"><Link href={alert.href} target={alert.external ? "_blank" : undefined} rel={alert.external ? "noopener noreferrer" : undefined} aria-label={`${alert.title} 열기`}><ArrowRight className="h-4 w-4" /></Link></Button>
              </div>
            }) : <div className="p-12 text-center text-sm text-slate-500"><CheckCheck className="mx-auto mb-3 h-8 w-8 text-emerald-500" />{loadError ? "연결 후 알림을 다시 불러와 주세요." : "새로운 알림이 없습니다."}</div>}
          </CardContent></Card>
        </section>

        <aside className="space-y-5">
          {priorityAlert ? <Card className="border-rose-100 bg-gradient-to-br from-rose-50 to-white shadow-sm">
            <CardHeader className="pb-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-600"><CircleAlert className="h-4 w-4" /></div><CardTitle className="mt-3 text-base">즉시 확인 필요</CardTitle></CardHeader>
            <CardContent><p className="text-sm font-semibold text-slate-800">{priorityAlert.title}</p><p className="mt-2 text-sm leading-6 text-slate-600">{priorityAlert.description}</p><Button asChild onClick={() => markRead(priorityAlert.id)} className="mt-4 w-full bg-blue-600 hover:bg-blue-700"><Link href={priorityAlert.href} target={priorityAlert.external ? "_blank" : undefined} rel={priorityAlert.external ? "noopener noreferrer" : undefined}>상세 보기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent>
          </Card> : <Card className="border-emerald-100 bg-gradient-to-br from-emerald-50 to-white shadow-sm">
            <CardHeader className="pb-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600"><Check className="h-4 w-4" /></div><CardTitle className="mt-3 text-base">긴급 알림 없음</CardTitle></CardHeader>
            <CardContent><p className="text-sm leading-6 text-slate-600">현재 즉시 확인해야 할 고위험 알림이 없습니다.</p></CardContent>
          </Card>}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">알림 기준</CardTitle><CardDescription className="mt-1">현재 설정된 모니터링 조건</CardDescription></CardHeader>
            <CardContent className="space-y-4"><Rule label="고위험 경보" value={settings.high_risk ? `SGRI ${settings.high_threshold}점 이상` : "꺼짐"} /><Rule label="뉴스 경보" value={settings.news ? "영향도 높음 이슈" : "꺼짐"} /><Rule label="보고서 알림" value={settings.monthly_report ? "월간 자동 생성" : "꺼짐"} /><Button asChild variant="outline" className="w-full border-slate-200"><Link href="/settings?tab=alerts">알림 설정 관리</Link></Button></CardContent>
          </Card>
        </aside>
      </div>
    </main>
  </div>
}

function Rule({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-500">{label}</span><span className="text-right font-medium text-slate-800">{value}</span></div>
}
