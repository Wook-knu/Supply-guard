"use client"

// Google Identity Services와 데모 이메일 로그인을 모두 제공하는 인증 화면입니다.

import Script from "next/script"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Chrome, Loader2, Mail, ShieldAlert } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type GoogleCredentialResponse = { credential?: string }

// Google Identity Services 전역 (스크립트 로드 후 window.google)
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: GoogleCredentialResponse) => void
          }) => void
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [emailError, setEmailError] = useState("")
  const [isGoogleScriptReady, setIsGoogleScriptReady] = useState(false)
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false)
  const [googleError, setGoogleError] = useState("")
  const googleBtnRef = useRef<HTMLDivElement>(null)
  const googleSubmittingRef = useRef(false)
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  // Google 공식 버튼을 렌더하고 credential(ID 토큰)을 백엔드 JWT로 교환합니다.
  useEffect(() => {
    if (!googleClientId || !isGoogleScriptReady || !googleBtnRef.current) return

    const googleIdentity = window.google?.accounts?.id
    if (!googleIdentity) {
      setGoogleError("Google 로그인 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.")
      return
    }

    let isActive = true
    const buttonContainer = googleBtnRef.current
    buttonContainer.replaceChildren()
    setGoogleError("")

    googleIdentity.initialize({
      client_id: googleClientId,
      callback: async (response) => {
        if (!isActive || googleSubmittingRef.current) return
        if (!response.credential) {
          setGoogleError("Google 계정 인증 정보를 받지 못했습니다. 다시 시도해 주세요.")
          return
        }

        googleSubmittingRef.current = true
        setIsGoogleSubmitting(true)
        setGoogleError("")
        try {
          await api.googleLogin(response.credential)
          router.replace("/dashboard")
          router.refresh()
        } catch (error) {
          if (!isActive) return
          setGoogleError(error instanceof Error ? error.message : "Google 로그인에 실패했습니다. 다시 시도해 주세요.")
          googleSubmittingRef.current = false
          setIsGoogleSubmitting(false)
        }
      },
    })
    googleIdentity.renderButton(buttonContainer, {
      theme: "outline",
      size: "large",
      width: 360,
      text: "signin_with",
      shape: "rectangular",
      locale: "ko",
    })

    return () => {
      isActive = false
    }
  }, [googleClientId, isGoogleScriptReady, router])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setEmailError("")

    try {
      await api.login({ email })
      router.replace("/dashboard")
      router.refresh()
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : "로그인에 실패했습니다. 이메일을 확인하고 다시 시도해 주세요.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-2">
      {googleClientId && (
        <Script
          id="google-gsi"
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onReady={() => setIsGoogleScriptReady(true)}
          onError={() => setGoogleError("Google 로그인 스크립트를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.")}
        />
      )}

      <section className="hidden bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2.5"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15"><ShieldAlert className="h-5 w-5" /></div><span className="font-semibold">SupplyGuard</span></div>
        <div><p className="text-sm font-medium text-blue-100">AI 기반 공급망 리스크 관리</p><h1 className="mt-4 max-w-md text-4xl font-semibold leading-tight">불확실한 공급망을<br />선제적으로 관리하세요.</h1><p className="mt-5 max-w-md leading-7 text-blue-100">품목별 위험 신호부터 대체 공급처와 대응 보고서까지, 하나의 흐름으로 제공합니다.</p></div>
        <p className="text-sm text-blue-100">© 2026 SupplyGuard</p>
      </section>

      <section className="flex items-center justify-center p-5">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-2.5 lg:hidden"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 text-white"><ShieldAlert className="h-5 w-5" /></div><span className="font-semibold">SupplyGuard</span></div>
          <h2 className="text-2xl font-semibold tracking-tight">SupplyGuard 시작하기</h2>
          <p className="mt-2 text-sm text-slate-500">업무용 계정으로 로그인해 공급망을 관리하세요.</p>

          {googleClientId ? (
            <div className="mt-8">
              <div ref={googleBtnRef} aria-busy={isGoogleSubmitting} className={`flex min-h-11 justify-center ${isGoogleSubmitting ? "pointer-events-none opacity-60" : ""}`} />
              {!isGoogleScriptReady && !googleError && <p role="status" className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Google 로그인 준비 중...</p>}
              {isGoogleSubmitting && <p role="status" className="mt-2 flex items-center justify-center gap-2 text-xs text-blue-600"><Loader2 className="h-3.5 w-3.5 animate-spin" />Google 계정을 확인하고 있습니다.</p>}
            </div>
          ) : (
            <div className="mt-8">
              <Button disabled variant="outline" className="w-full border-slate-200 py-6"><Chrome className="mr-3 h-5 w-5" />Google 로그인</Button>
              <p className="mt-2 text-center text-xs text-amber-600">Google Client ID 설정 후 사용할 수 있습니다.</p>
            </div>
          )}
          {googleError && <p role="alert" className="mt-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{googleError}</p>}

          <div className="my-6 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" /> 또는 <span className="h-px flex-1 bg-slate-200" /></div>
          <form onSubmit={handleSubmit}>
            <Label htmlFor="email" className="text-sm font-medium">이메일</Label>
            <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.co.kr" autoComplete="email" required className="mt-2" />
            {emailError && <p role="alert" className="mt-3 text-sm text-red-600">{emailError}</p>}
            <Button type="submit" disabled={isSubmitting || isGoogleSubmitting} className="mt-4 w-full bg-blue-600 py-6 hover:bg-blue-700"><Mail className="mr-2 h-4 w-4" />{isSubmitting ? "로그인 중..." : "이메일로 로그인"}</Button>
          </form>
          <p className="mt-6 text-center text-xs leading-5 text-slate-400">계속하면 SupplyGuard 이용약관 및 개인정보 처리방침에 동의하게 됩니다.</p>
        </div>
      </section>
    </div>
  )
}
