"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

const LoginGlobe = dynamic(() => import("@/components/login-globe"), { ssr: false })
import { ArrowRight, Building2, Check, Chrome, Globe2, Mail, ShieldAlert, Sparkles } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Google Identity Services 전역 (스크립트 로드 후 window.google)
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (r: { credential: string }) => void }) => void
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const googleBtnRef = useRef<HTMLDivElement>(null)
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  // 구글 로그인 버튼 렌더 (Client ID 설정된 경우에만)
  useEffect(() => {
    if (!googleClientId || !googleBtnRef.current) return
    function init() {
      const gid = window.google?.accounts?.id
      if (!gid || !googleBtnRef.current) return
      gid.initialize({
        client_id: googleClientId!,
        callback: async (resp) => {
          try {
            await api.googleLogin(resp.credential)
            router.push("/dashboard")
          } catch {
            setError("구글 로그인에 실패했습니다. 다시 시도해 주세요.")
          }
        },
      })
      gid.renderButton(googleBtnRef.current, {
        theme: "outline", size: "large", width: 360, text: "signin_with", locale: "ko",
      })
    }
    const SCRIPT_ID = "google-gsi"
    if (document.getElementById(SCRIPT_ID)) { init(); return }
    const s = document.createElement("script")
    s.src = "https://accounts.google.com/gsi/client"
    s.async = true
    s.defer = true
    s.id = SCRIPT_ID
    s.onload = init
    document.body.appendChild(s)
  }, [googleClientId, router])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError("")

    try {
      if (mode === "signup") {
        await api.register({ email, password, name: name || undefined })
      } else {
        await api.login({ email, password })
      }
      router.push("/dashboard")
    } catch (err) {
      // 백엔드가 detail에 한글 메시지를 줌 (409 이미가입, 401 비번틀림 등)
      const raw = err instanceof Error ? err.message : ""
      const match = raw.match(/"detail":"([^"]+)"/)
      setError(match?.[1] || (mode === "signup"
        ? "회원가입에 실패했습니다. 입력값을 확인해 주세요."
        : "로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요."))
    } finally {
      setIsSubmitting(false)
    }
  }

  return <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-cyan-700">
    {/* 전체 화면 회전 지구본 */}
    <div className="absolute inset-0"><LoginGlobe /></div>
    {/* 가독성용 은은한 비네트 */}
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(2,6,23,0.45)_100%)]" />

    {/* 좌상단 브랜드 */}
    <div className="pointer-events-none absolute left-6 top-6 z-20 flex items-center gap-2.5 text-white drop-shadow"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur"><ShieldAlert className="h-5 w-5" /></div><span className="font-semibold">SupplyGuard</span></div>

    {/* 중앙에 떠 있는 로그인 카드 */}
    <div className="relative z-10 flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md rounded-3xl border border-white/50 bg-white/85 p-8 shadow-2xl shadow-blue-950/40 backdrop-blur-xl md:p-10">
        <div className="mb-1 flex items-center gap-2 text-xs font-medium text-blue-600"><Sparkles className="h-3.5 w-3.5" /> AI 공급망 리스크 관리</div>
        <h2 className="text-2xl font-semibold tracking-tight">{mode === "signup" ? "회원가입" : "SupplyGuard 시작하기"}</h2>
        <p className="mt-2 text-sm text-slate-500">{mode === "signup" ? "이메일과 비밀번호로 계정을 만드세요." : "업무용 계정으로 로그인해 공급망을 관리하세요."}</p>
        {googleClientId ? <div ref={googleBtnRef} className="mt-7 flex justify-center" /> : <Button disabled variant="outline" className="mt-7 w-full rounded-2xl border-slate-200 py-6"><Chrome className="mr-3 h-5 w-5" />Google 로그인 (설정 필요)</Button>}
        <div className="my-6 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" /> 또는 <span className="h-px flex-1 bg-slate-200" /></div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && <div><Label htmlFor="name" className="text-sm font-medium">이름 <span className="font-normal text-slate-400">(선택)</span></Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" autoComplete="name" className="mt-2 h-12 rounded-2xl bg-white/70 transition-all focus-visible:ring-2 focus-visible:ring-blue-400" /></div>}
          <div><Label htmlFor="email" className="text-sm font-medium">이메일</Label><Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.co.kr" autoComplete="email" required className="mt-2 h-12 rounded-2xl bg-white/70 transition-all focus-visible:ring-2 focus-visible:ring-blue-400" /></div>
          <div><Label htmlFor="password" className="text-sm font-medium">비밀번호</Label><Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "8자 이상" : "비밀번호"} autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} className="mt-2 h-12 rounded-2xl bg-white/70 transition-all focus-visible:ring-2 focus-visible:ring-blue-400" /></div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={isSubmitting} className="h-12 w-full rounded-2xl bg-blue-600 text-base shadow-lg shadow-blue-500/25 transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-blue-500/40 active:translate-y-0"><Mail className="mr-2 h-4 w-4" />{isSubmitting ? (mode === "signup" ? "가입 중..." : "로그인 중...") : (mode === "signup" ? "회원가입" : "로그인")}</Button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">{mode === "signup" ? "이미 계정이 있으신가요? " : "계정이 없으신가요? "}<button type="button" onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError("") }} className="font-semibold text-blue-600 hover:underline">{mode === "signup" ? "로그인" : "회원가입"}</button></p>
      </div>
    </div>

    <p className="pointer-events-none absolute bottom-4 left-0 right-0 z-10 text-center text-xs text-white/70">🌐 배경 지구본을 드래그해 돌려 보세요 · © 2026 SupplyGuard</p>
  </div>
}

function CompanySetup({ onComplete }: { onComplete: () => void }) { return <div className="grid min-h-screen place-items-center bg-slate-50 p-5"><Card className="w-full max-w-xl border-slate-200 shadow-sm"><CardContent className="p-7 md:p-9"><div className="flex items-center gap-2 text-sm font-medium text-blue-600"><Sparkles className="h-4 w-4" /> 첫 설정</div><h1 className="mt-3 text-2xl font-semibold">기업 정보를 알려주세요</h1><p className="mt-2 text-sm text-slate-500">맞춤형 공급망 리스크 분석을 위해 필요한 기본 정보입니다.</p><div className="mt-7 grid gap-5 md:grid-cols-2"><Field label="기업명"><Input placeholder="예: SupplyGuard Demo Co." /></Field><Field label="산업군"><Input placeholder="예: 배터리 소재 제조" /></Field><Field label="주요 수입 국가"><Input placeholder="예: 중국, 대만" /></Field><Field label="담당자 이메일"><Input placeholder="name@company.co.kr" type="email" /></Field></div><div className="mt-7 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-600"><Globe2 className="mr-2 inline h-4 w-4 text-blue-600" /> 다음 단계에서 품목을 등록하면 국가 의존도와 공급망 위험도를 분석합니다.</div><div className="mt-7 flex justify-end"><Button onClick={onComplete} className="bg-blue-600 hover:bg-blue-700">설정 완료 <ArrowRight className="ml-2 h-4 w-4" /></Button></div></CardContent></Card></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="text-sm font-medium">{label}</Label><div className="mt-2">{children}</div></div> }
