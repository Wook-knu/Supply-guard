"use client"

// 백엔드 요금제 카탈로그와 현재 구독 상태를 그대로 표시하고 데모 플랜 변경을 실행합니다.

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, Building2, Check, CheckCircle2, CircleAlert, Crown, Loader2, Package, RefreshCw, Rocket, ShieldAlert, Sparkles } from "lucide-react"
import { api, type PlanFeatures, type SubscriptionPlan, type SubscriptionState } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

const FEATURE_ROWS: Array<{ key: keyof PlanFeatures; label: string }> = [
  { key: "monitoring", label: "품목 모니터링" },
  { key: "country_risk", label: "국가·SGRI 리스크" },
  { key: "price_alerts", label: "가격 변동 알림" },
  { key: "recommendations", label: "대체 공급처 추천" },
  { key: "ai_reports", label: "AI 분석 보고서" },
  { key: "reweight", label: "AI 가중치 재계산" },
  { key: "api_access", label: "외부 API 제공" },
]

const PLAN_ICONS = { basic: Package, pro: Rocket, enterprise: Building2 }

function priceLabel(plan: SubscriptionPlan) {
  const monthly = `${Math.round(plan.price_krw / 10_000).toLocaleString("ko-KR")}만원`
  return plan.custom_quote ? `${monthly}+` : monthly
}

export default function PricingPage() {
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [changingPlan, setChangingPlan] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [changeError, setChangeError] = useState("")

  const loadSubscription = useCallback(async () => {
    setStatus("loading")
    setChangeError("")
    try {
      setSubscription(await api.getSubscription())
      setStatus("ready")
    } catch (error) {
      setStatus("error")
      setChangeError(error instanceof Error ? error.message : "구독 정보를 불러오지 못했습니다.")
    }
  }, [])

  useEffect(() => {
    void loadSubscription()
  }, [loadSubscription])

  const usagePercent = useMemo(() => {
    if (!subscription?.usage.items_limit) return 0
    return Math.min(100, Math.round((subscription.usage.items / subscription.usage.items_limit) * 100))
  }, [subscription])

  async function changePlan(plan: SubscriptionPlan) {
    if (!subscription || plan.key === subscription.current_plan || plan.custom_quote || changingPlan) return
    setChangingPlan(plan.key)
    setMessage("")
    setChangeError("")
    try {
      const result = await api.subscribe(plan.key)
      setSubscription((current) => current ? {
        ...current,
        current_plan: result.current_plan,
        label: result.label,
        usage: result.usage,
        features: result.features,
      } : current)
      setMessage(`${result.label} 요금제로 변경했습니다.`)
    } catch (error) {
      setChangeError(error instanceof Error ? error.message : "요금제를 변경하지 못했습니다.")
    } finally {
      setChangingPlan(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div>
          <span className="font-semibold tracking-tight">SupplyGuard</span>
        </Link>
        {subscription && <Badge className="border-blue-100 bg-blue-50 px-3 py-1.5 text-blue-700 hover:bg-blue-50"><Crown className="mr-1.5 h-3.5 w-3.5" />{subscription.label}</Badge>}
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기</Link>
        <section className="mx-auto mt-7 max-w-3xl text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-sm"><Sparkles className="h-5 w-5" /></div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl">사업 규모에 맞는 요금제를 선택하세요</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">모니터링 범위와 AI 분석 기능을 비교하고 필요한 플랜으로 즉시 변경할 수 있습니다.</p>
        </section>

        {status === "loading" && (
          <Card className="mx-auto mt-10 max-w-3xl border-slate-200 shadow-sm"><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /><p className="mt-4 text-sm font-medium text-slate-700">요금제와 사용량을 불러오는 중입니다.</p></CardContent></Card>
        )}

        {status === "error" && (
          <Card className="mx-auto mt-10 max-w-3xl border-rose-100 shadow-sm"><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><CircleAlert className="h-9 w-9 text-rose-500" /><p className="mt-4 font-semibold">구독 정보를 표시할 수 없습니다.</p><p className="mt-2 max-w-xl text-sm text-slate-500">{changeError}</p><Button type="button" onClick={() => void loadSubscription()} className="mt-5 bg-blue-600 hover:bg-blue-700"><RefreshCw className="mr-2 h-4 w-4" />다시 시도</Button></CardContent></Card>
        )}

        {status === "ready" && subscription && (
          <>
            <Card className="mt-9 border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 shadow-sm">
              <CardContent className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">현재 {subscription.label} 플랜</p><Badge className="border-blue-100 bg-white text-blue-700 hover:bg-white">현재 이용 중</Badge></div>
                  <p className="mt-2 text-sm text-slate-600">모니터링 품목 <span className="font-semibold text-blue-700">{subscription.usage.items} / {subscription.usage.items_limit ?? "무제한"}</span></p>
                  {subscription.usage.items_limit != null && <Progress value={usagePercent} className="mt-3 h-2 max-w-xl" />}
                </div>
                <div className="rounded-lg border border-blue-100 bg-white px-4 py-3 text-right"><p className="text-xs text-slate-400">남은 등록 가능 품목</p><p className="mt-1 text-xl font-semibold text-blue-700">{subscription.usage.items_limit == null ? "무제한" : `${Math.max(0, subscription.usage.items_limit - subscription.usage.items)}개`}</p></div>
              </CardContent>
            </Card>

            {message && <div role="status" className="mt-5 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />{message}</div>}
            {changeError && <div role="alert" className="mt-5 flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{changeError}</div>}

            <section className="mt-7 grid gap-5 lg:grid-cols-3">
              {subscription.plans.map((plan) => {
                const current = plan.key === subscription.current_plan
                const Icon = PLAN_ICONS[plan.key as keyof typeof PLAN_ICONS] ?? Package
                const isPro = plan.key === "pro"
                return (
                  <Card key={plan.key} className={`relative flex h-full flex-col shadow-sm ${current ? "border-blue-500 ring-1 ring-blue-500" : isPro ? "border-blue-200" : "border-slate-200"}`}>
                    {isPro && !current && <Badge className="absolute right-4 top-4 border-0 bg-blue-600 text-white hover:bg-blue-600">추천</Badge>}
                    <CardHeader className="pb-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isPro ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}><Icon className="h-5 w-5" /></div>
                      <div className="mt-3 flex items-center gap-2"><CardTitle className="text-xl">{plan.label}</CardTitle>{current && <Badge className="border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-50">현재 플랜</Badge>}</div>
                      <CardDescription className="min-h-10 pt-1">{plan.target}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col">
                      <div><span className="text-3xl font-semibold tracking-tight">{priceLabel(plan)}</span>{!plan.custom_quote && <span className="ml-1 text-sm text-slate-400">/ 월</span>}{plan.custom_quote && <p className="mt-1 text-xs text-slate-400">기업별 별도 견적</p>}</div>
                      <p className="mt-4 text-sm font-medium text-slate-700">품목 {plan.max_items == null ? "무제한" : `최대 ${plan.max_items}개`}</p>
                      <ul className="mt-5 flex-1 space-y-3">
                        {plan.highlights.map((highlight) => <li key={highlight} className="flex items-start gap-2 text-sm leading-5 text-slate-600"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{highlight}</li>)}
                      </ul>
                      {current ? (
                        <Button type="button" disabled className="mt-7 w-full">현재 이용 중</Button>
                      ) : plan.custom_quote ? (
                        <Button asChild variant="outline" className="mt-7 w-full border-slate-300"><a href="mailto:jswook@kookmin.ac.kr?subject=SupplyGuard%20Enterprise%20문의">이메일로 문의하기</a></Button>
                      ) : (
                        <Button type="button" onClick={() => void changePlan(plan)} disabled={changingPlan !== null} className={`mt-7 w-full ${isPro ? "bg-blue-600 hover:bg-blue-700" : ""}`}>{changingPlan === plan.key ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />변경 중...</> : "이 요금제로 변경"}</Button>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </section>

            <Card className="mt-7 border-slate-200 shadow-sm">
              <CardHeader><CardTitle className="text-base">플랜별 기능 비교</CardTitle><CardDescription>기능 제공 여부는 서버의 현재 요금제 정책을 기준으로 표시됩니다.</CardDescription></CardHeader>
              <CardContent className="overflow-x-auto">
                <div className="min-w-[620px]">
                  <div className="grid grid-cols-4 border-b border-slate-200 pb-3 text-sm font-semibold"><span>기능</span>{subscription.plans.map((plan) => <span key={plan.key} className="text-center">{plan.label}</span>)}</div>
                  {FEATURE_ROWS.map((feature) => <div key={feature.key} className="grid grid-cols-4 items-center border-b border-slate-100 py-3 text-sm last:border-0"><span className="text-slate-600">{feature.label}</span>{subscription.plans.map((plan) => <span key={plan.key} className="flex justify-center">{plan.features[feature.key] ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <span className="text-slate-300">—</span>}</span>)}</div>)}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
