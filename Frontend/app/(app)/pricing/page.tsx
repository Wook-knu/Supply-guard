"use client"

// 구독 요금제 페이지 — 카탈로그 조회, 현재 플랜/사용량 표시, 플랜 변경(데모 mock 결제).
// 백엔드: GET/POST /subscription (backend/app/api/v1/subscription.py)

import Link from "next/link"
import { useEffect, useState } from "react"
import { api, type SubscriptionState } from "@/lib/api"
import { ArrowLeft, Bell, Check, CreditCard, Loader2, Minus, ShieldAlert, Sparkles } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

// 비교표에 노출할 기능 순서/라벨
const FEATURE_ROWS: { key: string; label: string }[] = [
  { key: "monitoring", label: "품목 모니터링" },
  { key: "country_risk", label: "국가 의존도·SGRI 분석" },
  { key: "price_alerts", label: "원자재 가격 변동 알림" },
  { key: "recommendations", label: "대체 공급처 추천" },
  { key: "ai_reports", label: "AI 리스크 보고서" },
  { key: "reweight", label: "AI 가중치 재계산" },
  { key: "api_access", label: "API 연동 제공" },
]

const PRICE_LABEL = (krw: number) => `${(krw / 10_000).toLocaleString("ko-KR")}만원`

export default function PricingPage() {
  const [state, setState] = useState<SubscriptionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [changing, setChanging] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")

  const load = () => {
    setLoading(true)
    api.getSubscription()
      .then((s) => { setState(s); setError("") })
      .catch(() => setError("요금제 정보를 불러오지 못했습니다. 로그인 상태를 확인해 주세요."))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const changePlan = async (key: string, label: string) => {
    if (!state || key === state.current_plan || changing) return
    if (!window.confirm(`${label} 요금제로 변경할까요?\n(데모 환경 — 실제 결제는 발생하지 않습니다)`)) return
    setChanging(key)
    setNotice("")
    try {
      const res = await api.subscribe(key)
      setState((prev) => (prev ? { ...prev, current_plan: res.current_plan, label: res.label, usage: res.usage, features: res.features } : prev))
      setNotice(`${label} 요금제로 변경되었습니다. 이제 해당 기능을 이용할 수 있어요.`)
    } catch {
      setError("요금제 변경 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setChanging(null)
    }
  }

  const contactEnterprise = () => {
    setNotice("Enterprise 도입 문의가 접수되었습니다. 담당자가 영업일 기준 1일 내 연락드립니다. (데모)")
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link>
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="relative text-slate-600"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 md:px-8">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기</Link>

        <div className="mt-6 text-center">
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-blue-600"><CreditCard className="h-4 w-4" /> 요금제</div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">비즈니스 규모에 맞는 플랜을 선택하세요</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">공급망 규모와 필요한 분석 수준에 따라 언제든 업·다운그레이드할 수 있습니다.</p>
        </div>

        {notice && <div role="status" className="mx-auto mt-6 max-w-2xl rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700">{notice}</div>}
        {error && <div role="alert" className="mx-auto mt-6 max-w-2xl rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">{error}</div>}

        {loading ? (
          <div className="flex justify-center py-24 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : state ? (
          <>
            {/* 현재 플랜/사용량 요약 */}
            <div className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-1 rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm">
              <span className="text-slate-500">현재 이용 중: <span className="font-semibold text-slate-800">{state.label}</span></span>
              <span className="text-slate-500">등록 품목: <span className="font-semibold text-slate-800">{state.usage.items}{state.usage.items_limit != null ? ` / ${state.usage.items_limit}개` : "개 (무제한)"}</span></span>
            </div>

            {/* 요금제 카드 */}
            <div className="mt-8 grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {state.plans.map((plan) => {
                const isCurrent = plan.key === state.current_plan
                const isPro = plan.key === "pro"
                return (
                  <Card key={plan.key} className={`relative flex h-full flex-col hover:-translate-y-1 hover:shadow-xl ${isPro ? "border-blue-500 shadow-lg ring-1 ring-blue-500" : "border-slate-200 shadow-sm"}`}>
                    {isPro && <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 border-0 bg-blue-600 px-3 py-1 text-white hover:bg-blue-600">가장 인기</Badge>}
                    <CardHeader className="pb-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{plan.label}</CardTitle>
                        {isCurrent && <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">이용 중</Badge>}
                      </div>
                      <CardDescription className="mt-1">{plan.target}</CardDescription>
                      <div className="mt-4 flex items-end gap-1">
                        {plan.custom_quote ? (
                          <span className="text-2xl font-bold tracking-tight">별도 견적</span>
                        ) : plan.price_krw === 0 ? (
                          <span className="text-3xl font-bold tracking-tight">무료</span>
                        ) : (
                          <><span className="text-3xl font-bold tracking-tight">{PRICE_LABEL(plan.price_krw)}</span><span className="pb-1 text-sm text-slate-400">/ 월</span></>
                        )}
                      </div>
                      {plan.custom_quote && <p className="mt-1 text-xs text-slate-400">월 300만원~ · 규모별 맞춤 견적</p>}
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col">
                      <ul className="space-y-2.5 text-sm text-slate-600">
                        {plan.highlights.map((h) => (
                          <li key={h} className="flex gap-2"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${isPro ? "text-blue-600" : "text-emerald-500"}`} />{h}</li>
                        ))}
                      </ul>
                      <div className="mt-6 pt-2">
                        {plan.custom_quote ? (
                          <Button onClick={contactEnterprise} variant="outline" className="w-full border-slate-300">도입 문의하기</Button>
                        ) : isCurrent ? (
                          <Button disabled variant="outline" className="w-full border-slate-200 text-slate-400">현재 이용 중</Button>
                        ) : (
                          <Button onClick={() => changePlan(plan.key, plan.label)} disabled={changing !== null} className={`w-full ${isPro ? "bg-blue-600 hover:bg-blue-700" : ""}`} variant={isPro ? "default" : "outline"}>
                            {changing === plan.key ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />변경 중...</> : "이 요금제 선택"}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* 기능 비교표 */}
            <div className="mt-12">
              <h2 className="mb-4 text-center text-lg font-semibold">기능 비교</h2>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className="px-5 py-3 text-left font-medium text-slate-500">기능</th>
                      {state.plans.map((p) => (
                        <th key={p.key} className={`px-5 py-3 text-center font-semibold ${p.key === state.current_plan ? "text-blue-700" : "text-slate-700"}`}>{p.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FEATURE_ROWS.map((row) => (
                      <tr key={row.key} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-3 text-slate-600">{row.label}</td>
                        {state.plans.map((p) => (
                          <td key={p.key} className="px-5 py-3 text-center">
                            {p.features[row.key]
                              ? <Check className="mx-auto h-4 w-4 text-emerald-500" />
                              : <Minus className="mx-auto h-4 w-4 text-slate-300" />}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <td className="px-5 py-3 text-slate-600">품목 등록 한도</td>
                      {state.plans.map((p) => (
                        <td key={p.key} className="px-5 py-3 text-center font-medium text-slate-700">{p.max_items != null ? `${p.max_items}개` : "무제한"}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-blue-500" /> 데모 환경에서는 실제 결제 없이 플랜이 즉시 전환되어 기능을 체험할 수 있습니다.
            </p>
          </>
        ) : null}
      </main>
    </div>
  )
}
