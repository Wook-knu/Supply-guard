"use client"

// 계정·모니터링 품목·사용자별 알림 설정을 API에서 조회하고 저장합니다.

import Link from "next/link"
import { useEffect, useState } from "react"
import { api, type AlertSettings, type UserOut } from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { getCountryName } from "@/lib/countries"
import { ArrowLeft, Check, Plus, Save, Settings2, ShieldAlert } from "lucide-react"
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
  const [alerts, setAlerts] = useState<AlertSettings>({ high_risk: true, news: true, monthly_report: true, high_threshold: 70 })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [activeTab, setActiveTab] = useState("company")
  const [user, setUser] = useState<UserOut | null>(null)
  const [riskItems, setRiskItems] = useState<Array<{ name: string; code: string; country: string; risk: string }>>([])

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab")
    if (["company", "items", "team", "alerts"].includes(requestedTab ?? "")) setActiveTab(requestedTab!)
    api.getMe().then(setUser).catch(() => setUser(null))
    api.getAlertSettings().then(setAlerts).catch(() => setSaveError("알림 설정을 불러오지 못했습니다."))
    // 품목명은 사용자가 등록한 값(item_name)에서 가져오고, 없을 때만 HS 코드로 표기한다.
    Promise.all([api.getRisks(), api.getQueries().catch(() => [])]).then(([rows, queries]) => {
      const nameByHsCode = new Map<string, string>()
      queries.forEach((query) => {
        const name = query.item_name?.trim()
        if (query.hs_code && name) nameByHsCode.set(query.hs_code, name)
      })
      const latestByItem = new Map<string, typeof rows[number]>()
      rows.forEach((row) => {
        const key = row.hs_code ?? ""
        const current = latestByItem.get(key)
        if (!current || row.as_of_date > current.as_of_date || (row.as_of_date === current.as_of_date && Number(row.sgri_score) > Number(current.sgri_score))) latestByItem.set(key, row)
      })
      setRiskItems([...latestByItem.values()].map((row) => ({
        name: (row.hs_code ? nameByHsCode.get(row.hs_code) : "") || `HS ${row.hs_code ?? "미지정"}`,
        code: `HS ${row.hs_code ?? "-"}`,
        country: getCountryName(row.country_code),
        risk: row.level === "높음" ? "고위험" : row.level === "중간" ? "주의" : "안정",
      })))
    }).catch(() => setRiskItems([]))
  }, [])

  async function saveAlerts() {
    setSaving(true); setSaved(false); setSaveError("")
    try { setAlerts(await api.saveAlertSettings(alerts)); setSaved(true) }
    catch { setSaveError("알림 설정을 저장하지 못했습니다.") }
    finally { setSaving(false) }
  }
  return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><Link href="/dashboard" className="flex items-center gap-2.5 lg:hidden"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link><UserAvatar /></header>
    <main className="mx-auto max-w-6xl px-5 py-8 md:px-8"><Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기</Link><div className="mt-6"><div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><Settings2 className="h-4 w-4" /> 계정·공급망 설정</div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">서비스 설정</h1><p className="mt-2 text-sm text-slate-500">로그인 계정과 모니터링 품목을 확인하고 개인 알림 기준을 변경합니다.</p></div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-7"><TabsList className="h-auto flex-wrap bg-slate-100"><TabsTrigger value="company">계정 정보</TabsTrigger><TabsTrigger value="items">공급망 품목</TabsTrigger><TabsTrigger value="team">현재 사용자</TabsTrigger><TabsTrigger value="alerts">알림 기준</TabsTrigger></TabsList>
        <TabsContent value="company" className="mt-6"><Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">로그인 계정 정보</CardTitle><CardDescription>현재 로그인 API에서 조회한 사용자와 소속 기업 연결 정보입니다.</CardDescription></CardHeader><CardContent className="grid gap-5 md:grid-cols-2"><Field label="담당자명"><Input value={user?.name ?? ""} readOnly placeholder="이름 미등록" /></Field><Field label="담당자 이메일"><Input value={user?.email ?? ""} readOnly placeholder="로그인 정보 없음" /></Field><Field label="계정 권한"><Input value={user?.role ?? ""} readOnly placeholder="권한 미지정" /></Field><Field label="소속 기업 ID"><Input value={user?.company_id != null ? String(user.company_id) : ""} readOnly placeholder="소속 기업 미등록" /></Field></CardContent></Card></TabsContent>
        <TabsContent value="items" className="mt-6"><Card className="border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between space-y-0"><div><CardTitle className="text-base">모니터링 품목</CardTitle><CardDescription className="mt-1">위험도 API에서 조회한 최신 품목입니다.</CardDescription></div><Button asChild className="bg-blue-600 hover:bg-blue-700"><Link href="/items/new"><Plus className="mr-2 h-4 w-4" />품목 추가</Link></Button></CardHeader><CardContent className="space-y-3">{riskItems.map((item) => <Item key={item.code} {...item} />)}{riskItems.length === 0 && <p className="py-8 text-center text-sm text-slate-400">조회된 모니터링 품목이 없습니다.</p>}</CardContent></Card></TabsContent>
        <TabsContent value="team" className="mt-6"><Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">현재 로그인 사용자</CardTitle><CardDescription className="mt-1">팀 초대 기능은 아직 제공하지 않으며, 현재 API에서 확인된 사용자만 표시합니다.</CardDescription></CardHeader><CardContent className="space-y-4">{user ? <Member name={user.name || user.email.split("@")[0]} email={user.email} role={user.role ?? "member"} initials={(user.name || user.email).slice(0, 2).toUpperCase()} /> : <p className="py-8 text-center text-sm text-slate-400">로그인 사용자 정보를 불러오지 못했습니다.</p>}</CardContent></Card></TabsContent>
        <TabsContent value="alerts" className="mt-6"><Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">알림 기준</CardTitle><CardDescription>사용자별 설정으로 저장되며 다시 로그인해도 유지됩니다.</CardDescription></CardHeader><CardContent className="space-y-6"><Toggle label="고위험 경보" description={`SGRI 점수가 ${alerts.high_threshold}점 이상일 때 즉시 알림`} checked={alerts.high_risk} onChange={(value) => setAlerts({ ...alerts, high_risk: value })} /><Field label="고위험 기준값"><Input type="number" min={0} max={100} value={alerts.high_threshold} onChange={(event) => setAlerts({ ...alerts, high_threshold: Math.max(0, Math.min(100, Number(event.target.value))) })} /></Field><Toggle label="뉴스·정책 경보" description="영향도가 높은 수출 규제·제재·물류 이슈 알림" checked={alerts.news} onChange={(value) => setAlerts({ ...alerts, news: value })} /><Toggle label="월간 보고서" description="매월 첫 영업일에 리스크 보고서 초안 생성 알림" checked={alerts.monthly_report} onChange={(value) => setAlerts({ ...alerts, monthly_report: value })} /><SaveButton saving={saving} onSave={() => void saveAlerts()} /></CardContent></Card></TabsContent>
      </Tabs>{saved && <div className="mt-5 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><Check className="h-4 w-4" /> 알림 설정이 계정에 저장되었습니다.</div>}{saveError && <div className="mt-5 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{saveError}</div>}</main></div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="text-sm font-medium">{label}</Label><div className="mt-2">{children}</div></div> }
function SaveButton({ saving, onSave }: { saving: boolean; onSave: () => void }) { return <div className="flex justify-end"><Button disabled={saving} onClick={onSave} className="bg-blue-600 hover:bg-blue-700"><Save className="mr-2 h-4 w-4" />{saving ? "저장 중…" : "변경사항 저장"}</Button></div> }
function Item({ name, code, country, risk }: { name: string; code: string; country: string; risk: string }) { return <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4"><div><p className="font-medium">{name} <span className="ml-1 text-xs font-normal text-slate-400">{code}</span></p><p className="mt-1 text-xs text-slate-500">주요 공급국 · {country}</p></div><Badge className={risk === "고위험" ? "border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-50" : "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-50"}>{risk}</Badge></div> }
function Member({ name, email, role, initials }: { name: string; email: string; role: string; initials: string }) { return <div className="flex items-center gap-3 rounded-lg border border-slate-100 p-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">{initials}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{name}</p><p className="text-xs text-slate-500">{email}</p></div><Badge className="border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-50">{role}</Badge></div> }
function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) { return <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-sm text-slate-500">{description}</p></div><Switch checked={checked} onCheckedChange={onChange} /></div> }
