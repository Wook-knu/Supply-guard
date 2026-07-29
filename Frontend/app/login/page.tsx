"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Building2, Check, Chrome, Globe2, Mail, ShieldAlert, Sparkles } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError("")

    try {
      await api.login({ email })
      router.push("/dashboard")
    } catch {
      setError("로그인에 실패했습니다. 이메일을 확인하고 다시 시도해 주세요.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return <div className="grid min-h-screen bg-slate-50 lg:grid-cols-2"><section className="hidden bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 p-12 text-white lg:flex lg:flex-col lg:justify-between"><div className="flex items-center gap-2.5"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15"><ShieldAlert className="h-5 w-5" /></div><span className="font-semibold">SupplyGuard</span></div><div><p className="text-sm font-medium text-blue-100">AI 기반 공급망 리스크 관리</p><h1 className="mt-4 max-w-md text-4xl font-semibold leading-tight">불확실한 공급망을<br />선제적으로 관리하세요.</h1><p className="mt-5 max-w-md leading-7 text-blue-100">품목별 위험 신호부터 대체 공급처와 대응 보고서까지, 하나의 흐름으로 제공합니다.</p></div><p className="text-sm text-blue-100">© 2026 SupplyGuard</p></section><section className="flex items-center justify-center p-5"><div className="w-full max-w-md"><div className="mb-10 flex items-center gap-2.5 lg:hidden"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 text-white"><ShieldAlert className="h-5 w-5" /></div><span className="font-semibold">SupplyGuard</span></div><h2 className="text-2xl font-semibold tracking-tight">SupplyGuard 시작하기</h2><p className="mt-2 text-sm text-slate-500">업무용 계정으로 로그인해 공급망을 관리하세요.</p><Button disabled variant="outline" className="mt-8 w-full border-slate-200 py-6"><Chrome className="mr-3 h-5 w-5" />Google 로그인 (준비 중)</Button><div className="my-6 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" /> 또는 <span className="h-px flex-1 bg-slate-200" /></div><form onSubmit={handleSubmit}><Label htmlFor="email" className="text-sm font-medium">이메일</Label><Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.co.kr" autoComplete="email" required className="mt-2" />{error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}<Button type="submit" disabled={isSubmitting} className="mt-4 w-full bg-blue-600 py-6 hover:bg-blue-700"><Mail className="mr-2 h-4 w-4" />{isSubmitting ? "로그인 중..." : "이메일로 로그인"}</Button></form><p className="mt-6 text-center text-xs leading-5 text-slate-400">계속하면 SupplyGuard 이용약관 및 개인정보 처리방침에 동의하게 됩니다.</p></div></section></div>
}

function CompanySetup({ onComplete }: { onComplete: () => void }) { return <div className="grid min-h-screen place-items-center bg-slate-50 p-5"><Card className="w-full max-w-xl border-slate-200 shadow-sm"><CardContent className="p-7 md:p-9"><div className="flex items-center gap-2 text-sm font-medium text-blue-600"><Sparkles className="h-4 w-4" /> 첫 설정</div><h1 className="mt-3 text-2xl font-semibold">기업 정보를 알려주세요</h1><p className="mt-2 text-sm text-slate-500">맞춤형 공급망 리스크 분석을 위해 필요한 기본 정보입니다.</p><div className="mt-7 grid gap-5 md:grid-cols-2"><Field label="기업명"><Input placeholder="예: SupplyGuard Demo Co." /></Field><Field label="산업군"><Input placeholder="예: 배터리 소재 제조" /></Field><Field label="주요 수입 국가"><Input placeholder="예: 중국, 대만" /></Field><Field label="담당자 이메일"><Input placeholder="name@company.co.kr" type="email" /></Field></div><div className="mt-7 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-600"><Globe2 className="mr-2 inline h-4 w-4 text-blue-600" /> 다음 단계에서 품목을 등록하면 국가 의존도와 공급망 위험도를 분석합니다.</div><div className="mt-7 flex justify-end"><Button onClick={onComplete} className="bg-blue-600 hover:bg-blue-700">설정 완료 <ArrowRight className="ml-2 h-4 w-4" /></Button></div></CardContent></Card></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="text-sm font-medium">{label}</Label><div className="mt-2">{children}</div></div> }
