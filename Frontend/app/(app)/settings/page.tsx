"use client"

// 내 프로필(이름·사진·비밀번호)은 API로 저장하고, 모니터링 품목은 위험도 API에서 조회합니다.
// 알림 기준은 저장 API 준비 전까지 화면 상태로 관리합니다.

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { api, type UserOut } from "@/lib/api"
import { getCountryName } from "@/lib/countries"
import { ArrowLeft, Camera, Check, KeyRound, Loader2, Plus, Save, Settings2, ShieldAlert, Trash2 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// 업로드 이미지를 128px 정사각형 data URL 로 축소 (스토리지 없이 저장하기 위함).
function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."))
    reader.onload = () => {
      const img = new window.Image()
      img.onerror = () => reject(new Error("이미지를 여는 데 실패했습니다."))
      img.onload = () => {
        const size = 128
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d")
        if (!ctx) return reject(new Error("캔버스를 사용할 수 없습니다."))
        const scale = Math.max(size / img.width, size / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
        resolve(canvas.toDataURL("image/jpeg", 0.82))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export default function SettingsPage() {
  const [saved, setSaved] = useState("")
  const [alerts, setAlerts] = useState({ high: true, news: true, report: true })
  const [user, setUser] = useState<UserOut | null>(null)
  const [riskItems, setRiskItems] = useState<Array<{ name: string; code: string; country: string; risk: string }>>([])

  // 프로필 편집 상태
  const [name, setName] = useState("")
  const [avatar, setAvatar] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileErr, setProfileErr] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  // 비밀번호 변경 상태
  const [curPw, setCurPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [newPw2, setNewPw2] = useState("")
  const [savingPw, setSavingPw] = useState(false)
  const [pwErr, setPwErr] = useState("")

  useEffect(() => {
    api.getMe().then((u) => {
      setUser(u)
      setName(u.name ?? "")
      setAvatar(u.picture_url ?? null)
    }).catch(() => setUser(null))
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

  async function pickAvatar(file: File | undefined) {
    if (!file) return
    setProfileErr("")
    if (!file.type.startsWith("image/")) { setProfileErr("이미지 파일을 선택해 주세요."); return }
    try {
      setAvatar(await fileToAvatarDataUrl(file))
    } catch (e) {
      setProfileErr(e instanceof Error ? e.message : "이미지 처리 실패")
    }
  }

  async function saveProfile() {
    setSavingProfile(true); setProfileErr(""); setSaved("")
    try {
      const updated = await api.updateMe({ name: name.trim(), picture_url: avatar })
      setUser(updated)
      setSaved("프로필이 저장되었습니다.")
    } catch (e) {
      setProfileErr(e instanceof Error ? e.message : "저장에 실패했습니다.")
    } finally { setSavingProfile(false) }
  }

  async function savePassword() {
    setPwErr(""); setSaved("")
    if (newPw.length < 8) { setPwErr("새 비밀번호는 8자 이상이어야 합니다."); return }
    if (newPw !== newPw2) { setPwErr("새 비밀번호가 서로 일치하지 않습니다."); return }
    setSavingPw(true)
    try {
      await api.changePassword({ current_password: curPw || undefined, new_password: newPw })
      setCurPw(""); setNewPw(""); setNewPw2("")
      setSaved("비밀번호가 변경되었습니다.")
    } catch (e) {
      setPwErr(e instanceof Error ? e.message : "변경에 실패했습니다.")
    } finally { setSavingPw(false) }
  }

  const initials = (user?.name || user?.email || "SW").slice(0, 2).toUpperCase()

  return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link><Avatar className="h-8 w-8 border border-slate-200">{avatar && <AvatarImage src={avatar} alt="" />}<AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">{initials}</AvatarFallback></Avatar></header>
    <main className="mx-auto max-w-6xl px-5 py-8 md:px-8"><Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기</Link><div className="mt-6"><div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><Settings2 className="h-4 w-4" /> 계정·공급망 설정</div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">서비스 설정</h1><p className="mt-2 text-sm text-slate-500">내 프로필, 모니터링 품목, 팀 알림 수신자를 관리합니다.</p></div>
      <Tabs defaultValue="profile" className="mt-7"><TabsList className="h-auto flex-wrap bg-slate-100"><TabsTrigger value="profile">내 프로필</TabsTrigger><TabsTrigger value="items">공급망 품목</TabsTrigger><TabsTrigger value="team">팀·수신자</TabsTrigger><TabsTrigger value="alerts">알림 기준</TabsTrigger></TabsList>

        <TabsContent value="profile" className="mt-6 space-y-6">
          <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">내 프로필</CardTitle><CardDescription>담당자 이름과 프로필 사진을 변경합니다.</CardDescription></CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-5">
                <div className="relative">
                  <Avatar className="h-20 w-20 border border-slate-200">{avatar && <AvatarImage src={avatar} alt="프로필" />}<AvatarFallback className="bg-blue-50 text-xl font-semibold text-blue-700">{initials}</AvatarFallback></Avatar>
                  <button type="button" onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-white shadow-sm hover:bg-blue-700" aria-label="사진 변경"><Camera className="h-4 w-4" /></button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickAvatar(e.target.files?.[0])} />
                </div>
                <div className="space-y-2">
                  <Button variant="outline" size="sm" className="border-slate-200" onClick={() => fileRef.current?.click()}><Camera className="mr-1.5 h-3.5 w-3.5" /> 사진 업로드</Button>
                  {avatar && <Button variant="ghost" size="sm" className="ml-1 text-slate-500 hover:text-rose-600" onClick={() => setAvatar(null)}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> 제거</Button>}
                  <p className="text-xs text-slate-400">JPG·PNG 권장 · 자동으로 128px로 저장됩니다.</p>
                </div>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="담당자명"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름을 입력하세요" /></Field>
                <Field label="이메일 (변경 불가)"><Input value={user?.email ?? ""} readOnly className="bg-slate-50 text-slate-500" /></Field>
              </div>
              {profileErr && <p className="text-sm text-rose-600">{profileErr}</p>}
              <div className="flex justify-end"><Button onClick={saveProfile} disabled={savingProfile} className="bg-blue-600 hover:bg-blue-700">{savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}프로필 저장</Button></div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm"><CardHeader><div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-slate-500" /><CardTitle className="text-base">비밀번호 변경</CardTitle></div><CardDescription>구글 로그인 계정은 현재 비밀번호 없이 새 비밀번호를 설정할 수 있습니다.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 md:grid-cols-3">
                <Field label="현재 비밀번호"><Input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="설정된 경우 입력" /></Field>
                <Field label="새 비밀번호"><Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="8자 이상" /></Field>
                <Field label="새 비밀번호 확인"><Input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} placeholder="다시 입력" /></Field>
              </div>
              {pwErr && <p className="text-sm text-rose-600">{pwErr}</p>}
              <div className="flex justify-end"><Button onClick={savePassword} disabled={savingPw || !newPw} variant="outline" className="border-slate-200">{savingPw ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}비밀번호 변경</Button></div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">계정 정보</CardTitle><CardDescription className="mt-1">로그인 API에서 조회한 정보입니다.</CardDescription></CardHeader>
            <CardContent className="divide-y divide-slate-100">
              {[["계정 권한", user?.role ?? "member"], ["구독 요금제", (user?.plan ?? "basic").toUpperCase()], ["소속 기업 ID", user?.company_id != null ? String(user.company_id) : "미등록"]].map(([k, v]) => <div className="flex justify-between gap-5 py-3 text-sm" key={k}><span className="text-slate-500">{k}</span><span className="font-medium">{v}</span></div>)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="items" className="mt-6"><Card className="border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between space-y-0"><div><CardTitle className="text-base">모니터링 품목</CardTitle><CardDescription className="mt-1">위험도 API에서 조회한 최신 품목입니다.</CardDescription></div><Button asChild className="bg-blue-600 hover:bg-blue-700"><Link href="/items/new"><Plus className="mr-2 h-4 w-4" />품목 추가</Link></Button></CardHeader><CardContent className="space-y-3">{riskItems.map((item) => <Item key={item.code} {...item} />)}{riskItems.length === 0 && <p className="py-8 text-center text-sm text-slate-400">조회된 모니터링 품목이 없습니다.</p>}</CardContent></Card></TabsContent>
        <TabsContent value="team" className="mt-6"><Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">팀원 및 보고서 수신자</CardTitle><CardDescription className="mt-1">현재 API에서 확인된 로그인 사용자입니다.</CardDescription></CardHeader><CardContent className="space-y-4">{user ? <Member name={user.name || user.email.split("@")[0]} email={user.email} role={user.role ?? "member"} avatar={avatar} initials={initials} /> : <p className="py-8 text-center text-sm text-slate-400">로그인 사용자 정보를 불러오지 못했습니다.</p>}</CardContent></Card></TabsContent>
        <TabsContent value="alerts" className="mt-6"><Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">알림 기준</CardTitle><CardDescription>알림 설정 저장 API가 준비되기 전까지 현재 화면에서만 적용됩니다.</CardDescription></CardHeader><CardContent className="space-y-6"><Toggle label="고위험 경보" description="SGRI 점수가 70점 이상일 때 즉시 알림" checked={alerts.high} onChange={(value) => setAlerts({ ...alerts, high: value })} /><Toggle label="뉴스·정책 경보" description="영향도가 높은 수출 규제·제재·물류 이슈 알림" checked={alerts.news} onChange={(value) => setAlerts({ ...alerts, news: value })} /><Toggle label="월간 보고서" description="매월 첫 영업일에 리스크 보고서 초안 생성 알림" checked={alerts.report} onChange={(value) => setAlerts({ ...alerts, report: value })} /><div className="flex justify-end"><Button onClick={() => setSaved("알림 설정이 현재 화면에 적용되었습니다.")} className="bg-blue-600 hover:bg-blue-700"><Save className="mr-2 h-4 w-4" />변경사항 저장</Button></div></CardContent></Card></TabsContent>
      </Tabs>{saved && <div className="mt-5 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><Check className="h-4 w-4" /> {saved}</div>}</main></div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="text-sm font-medium">{label}</Label><div className="mt-2">{children}</div></div> }
function Item({ name, code, country, risk }: { name: string; code: string; country: string; risk: string }) { return <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4"><div><p className="font-medium">{name} <span className="ml-1 text-xs font-normal text-slate-400">{code}</span></p><p className="mt-1 text-xs text-slate-500">주요 공급국 · {country}</p></div><Badge className={risk === "고위험" ? "border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-50" : "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-50"}>{risk}</Badge></div> }
function Member({ name, email, role, avatar, initials }: { name: string; email: string; role: string; avatar: string | null; initials: string }) { return <div className="flex items-center gap-3 rounded-lg border border-slate-100 p-3"><Avatar className="h-9 w-9">{avatar && <AvatarImage src={avatar} alt="" />}<AvatarFallback className="bg-blue-50 text-sm font-semibold text-blue-700">{initials}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="text-sm font-medium">{name}</p><p className="text-xs text-slate-500">{email}</p></div><Badge className="border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-50">{role}</Badge></div> }
function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) { return <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-sm text-slate-500">{description}</p></div><Switch checked={checked} onCheckedChange={onChange} /></div> }
