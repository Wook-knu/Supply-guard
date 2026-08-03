"use client"

// 계정과 모니터링 품목은 API에서 조회하고, 알림 설정은 저장 API 준비 전까지 화면 상태로 관리합니다.

import Link from "next/link"
import { useEffect, useState } from "react"
import { api, type UserOut } from "@/lib/api"
import { getCountryName } from "@/lib/countries"
import { ArrowLeft, Bell, Building2, Check, Globe2, Mail, Package, Plus, Save, Settings2, ShieldAlert, Trash2, Users } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function SettingsPage() {
  // saved는 저장 완료 안내 표시용이며 alerts는 알림 스위치의 현재 선택값입니다.
  const [saved, setSaved] = useState(false)
  const [alerts, setAlerts] = useState({ high: true, news: true, report: true })
  const [user, setUser] = useState<UserOut | null>(null)
  const [riskItems, setRiskItems] = useState<Array<{ name: string; code: string; country: string; risk: string }>>([])

  useEffect(() => {
    api.getMe().then(setUser).catch(() => setUser(null))
    api.getRisks().then((rows) => {
      const latestByItem = new Map<string, typeof rows[number]>()
      rows.forEach((row) => {
        const key = row.hs_code ?? ""
        const current = latestByItem.get(key)
        if (!current || row.as_of_date > current.as_of_date || (row.as_of_date === current.as_of_date && Number(row.sgri_score) > Number(current.sgri_score))) latestByItem.set(key, row)
      })
      setRiskItems([...latestByItem.values()].map((row) => ({
        name: row.hs_code === "283691" ? "리튬 탄산염" : `HS ${row.hs_code ?? "미지정"}`,
        code: `HS ${row.hs_code ?? "-"}`,
        country: getCountryName(row.country_code),
        risk: row.level === "높음" ? "고위험" : row.level === "중간" ? "주의" : "안정",
      })))
    }).catch(() => setRiskItems([]))
  }, [])
  return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></header>
    <main className="mx-auto max-w-6xl px-5 py-8 md:px-8"><Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기</Link><div className="mt-6"><div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><Settings2 className="h-4 w-4" /> 기업·공급망 설정</div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">서비스 설정</h1><p className="mt-2 text-sm text-slate-500">기업 정보, 모니터링 품목, 팀 알림 수신자를 관리합니다.</p></div>
      <Tabs defaultValue="company" className="mt-7"><TabsList className="h-auto flex-wrap bg-slate-100"><TabsTrigger value="company">기업 정보</TabsTrigger><TabsTrigger value="items">공급망 품목</TabsTrigger><TabsTrigger value="team">팀·수신자</TabsTrigger><TabsTrigger value="alerts">알림 기준</TabsTrigger></TabsList>
        <TabsContent value="company" className="mt-6"><Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">로그인 계정 정보</CardTitle><CardDescription>현재 로그인 API에서 조회한 사용자와 소속 기업 연결 정보입니다.</CardDescription></CardHeader><CardContent className="grid gap-5 md:grid-cols-2"><Field label="담당자명"><Input value={user?.name ?? ""} readOnly placeholder="이름 미등록" /></Field><Field label="담당자 이메일"><Input value={user?.email ?? ""} readOnly placeholder="로그인 정보 없음" /></Field><Field label="계정 권한"><Input value={user?.role ?? ""} readOnly placeholder="권한 미지정" /></Field><Field label="소속 기업 ID"><Input value={user?.company_id != null ? String(user.company_id) : ""} readOnly placeholder="소속 기업 미등록" /></Field></CardContent></Card></TabsContent>
        <TabsContent value="items" className="mt-6"><Card className="border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between space-y-0"><div><CardTitle className="text-base">모니터링 품목</CardTitle><CardDescription className="mt-1">위험도 API에서 조회한 최신 품목입니다.</CardDescription></div><Button asChild className="bg-blue-600 hover:bg-blue-700"><Link href="/items/new"><Plus className="mr-2 h-4 w-4" />품목 추가</Link></Button></CardHeader><CardContent className="space-y-3">{riskItems.map((item) => <Item key={item.code} {...item} />)}{riskItems.length === 0 && <p className="py-8 text-center text-sm text-slate-400">조회된 모니터링 품목이 없습니다.</p>}</CardContent></Card></TabsContent>
        <TabsContent value="team" className="mt-6"><Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">팀원 및 보고서 수신자</CardTitle><CardDescription className="mt-1">현재 API에서 확인된 로그인 사용자입니다.</CardDescription></CardHeader><CardContent className="space-y-4">{user ? <Member name={user.name || user.email.split("@")[0]} email={user.email} role={user.role ?? "member"} initials={(user.name || user.email).slice(0, 2).toUpperCase()} /> : <p className="py-8 text-center text-sm text-slate-400">로그인 사용자 정보를 불러오지 못했습니다.</p>}</CardContent></Card></TabsContent>
        <TabsContent value="alerts" className="mt-6"><Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">알림 기준</CardTitle><CardDescription>알림 설정 저장 API가 준비되기 전까지 현재 화면에서만 적용됩니다.</CardDescription></CardHeader><CardContent className="space-y-6"><Toggle label="고위험 경보" description="SGRI 점수가 70점 이상일 때 즉시 알림" checked={alerts.high} onChange={(value) => setAlerts({ ...alerts, high: value })} /><Toggle label="뉴스·정책 경보" description="영향도가 높은 수출 규제·제재·물류 이슈 알림" checked={alerts.news} onChange={(value) => setAlerts({ ...alerts, news: value })} /><Toggle label="월간 보고서" description="매월 첫 영업일에 리스크 보고서 초안 생성 알림" checked={alerts.report} onChange={(value) => setAlerts({ ...alerts, report: value })} /><SaveButton onSave={() => setSaved(true)} /></CardContent></Card></TabsContent>
      </Tabs>{saved && <div className="mt-5 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><Check className="h-4 w-4" /> 알림 설정이 현재 화면에 적용되었습니다.</div>}</main></div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="text-sm font-medium">{label}</Label><div className="mt-2">{children}</div></div> }
function SaveButton({ onSave }: { onSave: () => void }) { return <div className="flex justify-end"><Button onClick={onSave} className="bg-blue-600 hover:bg-blue-700"><Save className="mr-2 h-4 w-4" />변경사항 저장</Button></div> }
function Item({ name, code, country, risk }: { name: string; code: string; country: string; risk: string }) { return <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4"><div><p className="font-medium">{name} <span className="ml-1 text-xs font-normal text-slate-400">{code}</span></p><p className="mt-1 text-xs text-slate-500">주요 공급국 · {country}</p></div><Badge className={risk === "고위험" ? "border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-50" : "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-50"}>{risk}</Badge></div> }
function Member({ name, email, role, initials }: { name: string; email: string; role: string; initials: string }) { return <div className="flex items-center gap-3 rounded-lg border border-slate-100 p-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">{initials}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{name}</p><p className="text-xs text-slate-500">{email}</p></div><Badge className="border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-50">{role}</Badge></div> }
function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) { return <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-sm text-slate-500">{description}</p></div><Switch checked={checked} onCheckedChange={onChange} /></div> }
