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

  return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-cyan-50 p-4 md:p-8">
    {/* 토스식: 큰 라운드 카드가 부드러운 배경 위에 떠 있음 */}
    <div className="grid w-full max-w-5xl overflow-hidden rounded-[2.5rem] bg-white shadow-[0_30px_80px_-20px_rgba(30,64,175,0.25)] lg:min-h-[660px] lg:grid-cols-2">
      {/* 좌측: 회전하는 지구본 */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-blue-700 via-blue-500 to-cyan-400 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-90"><LoginGlobe /></div>
        <div className="pointer-events-none relative z-10 flex items-center gap-2.5"><div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/25 backdrop-blur"><ShieldAlert className="h-5 w-5" /></div><span className="font-semibold">SupplyGuard</span></div>
        <div className="pointer-events-none relative z-10">
          <p className="text-sm font-medium text-blue-50">AI 기반 공급망 리스크 관리</p>
          <h1 className="mt-4 max-w-md text-4xl font-bold leading-snug tracking-tight drop-shadow-sm">불확실한 공급망을<br />선제적으로 관리하세요.</h1>
          <p className="mt-5 max-w-md leading-7 text-blue-50/90 drop-shadow-sm">품목별 위험 신호부터 대체 공급국·대응 보고서까지, 하나의 흐름으로.</p>
          <p className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur">🌐 지구본을 드래그해 돌려 보세요</p>
        </div>
        <p className="pointer-events-none relative z-10 text-xs text-blue-100/70">© 2026 SupplyGuard</p>
      </section>

      {/* 우측: 로그인 폼 */}
      <section className="flex items-center justify-center px-6 py-10 md:px-12">
        <div className="w-full max-w-sm">
          <div className="mb-7 flex items-center gap-2.5 lg:hidden"><div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white"><ShieldAlert className="h-5 w-5" /></div><span className="font-semibold">SupplyGuard</span></div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{mode === "signup" ? "회원가입" : "다시 오셨네요 👋"}</h2>
          <p className="mt-2 text-sm text-slate-500">{mode === "signup" ? "이메일과 비밀번호로 계정을 만드세요." : "업무용 계정으로 로그인해 공급망을 관리하세요."}</p>
          {googleClientId ? <div ref={googleBtnRef} className="mt-8 flex justify-center" /> : <Button disabled variant="outline" className="mt-8 h-14 w-full rounded-2xl border-slate-200 bg-slate-50 text-slate-500"><Chrome className="mr-3 h-5 w-5" />Google 로그인 (설정 필요)</Button>}
          <div className="my-6 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-100" /> 또는 <span className="h-px flex-1 bg-slate-100" /></div>
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === "signup" && <div><Label htmlFor="name" className="ml-1 text-sm font-medium text-slate-600">이름 <span className="font-normal text-slate-400">(선택)</span></Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" autoComplete="name" className="mt-1.5 h-14 rounded-2xl border-slate-200 bg-slate-50 px-4 text-base transition-all focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-blue-100" /></div>}
            <div><Label htmlFor="email" className="ml-1 text-sm font-medium text-slate-600">이메일</Label><Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.co.kr" autoComplete="email" required className="mt-1.5 h-14 rounded-2xl border-slate-200 bg-slate-50 px-4 text-base transition-all focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-blue-100" /></div>
            <div><Label htmlFor="password" className="ml-1 text-sm font-medium text-slate-600">비밀번호</Label><Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "8자 이상" : "비밀번호"} autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} className="mt-1.5 h-14 rounded-2xl border-slate-200 bg-slate-50 px-4 text-base transition-all focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-blue-100" /></div>
            {error && <p role="alert" className="ml-1 text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={isSubmitting} className="mt-2 h-14 w-full rounded-2xl bg-blue-600 text-base font-semibold shadow-lg shadow-blue-500/25 transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-blue-500/40 active:translate-y-0">{isSubmitting ? (mode === "signup" ? "가입 중..." : "로그인 중...") : (mode === "signup" ? "회원가입" : "로그인")}</Button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">{mode === "signup" ? "이미 계정이 있으신가요? " : "계정이 없으신가요? "}<button type="button" onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError("") }} className="font-semibold text-blue-600 hover:underline">{mode === "signup" ? "로그인" : "회원가입"}</button></p>
          <p className="mt-4 text-center text-xs leading-5 text-slate-400">계속하면 SupplyGuard 이용약관 및 개인정보 처리방침에 동의하게 됩니다.</p>
        </div>
      </section>
    </div>
  </div>
}

function CompanySetup({ onComplete }: { onComplete: () => void }) { return <div className="grid min-h-screen place-items-center bg-slate-50 p-5"><Card className="w-full max-w-xl border-slate-200 shadow-sm"><CardContent className="p-7 md:p-9"><div className="flex items-center gap-2 text-sm font-medium text-blue-600"><Sparkles className="h-4 w-4" /> 첫 설정</div><h1 className="mt-3 text-2xl font-semibold">기업 정보를 알려주세요</h1><p className="mt-2 text-sm text-slate-500">맞춤형 공급망 리스크 분석을 위해 필요한 기본 정보입니다.</p><div className="mt-7 grid gap-5 md:grid-cols-2"><Field label="기업명"><Input placeholder="예: SupplyGuard Demo Co." /></Field><Field label="산업군"><Input placeholder="예: 배터리 소재 제조" /></Field><Field label="주요 수입 국가"><Input placeholder="예: 중국, 대만" /></Field><Field label="담당자 이메일"><Input placeholder="name@company.co.kr" type="email" /></Field></div><div className="mt-7 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-600"><Globe2 className="mr-2 inline h-4 w-4 text-blue-600" /> 다음 단계에서 품목을 등록하면 국가 의존도와 공급망 위험도를 분석합니다.</div><div className="mt-7 flex justify-end"><Button onClick={onComplete} className="bg-blue-600 hover:bg-blue-700">설정 완료 <ArrowRight className="ml-2 h-4 w-4" /></Button></div></CardContent></Card></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="text-sm font-medium">{label}</Label><div className="mt-2">{children}</div></div> }
