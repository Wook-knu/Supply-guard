"use client"

// 신규 모니터링 품목을 등록하고 백그라운드 SGRI 분석을 시작하는 화면입니다.

import Link from "next/link"
import { FormEvent, useEffect, useRef, useState } from "react"
import { api, type BuildItemSgriResult, type QueryOut } from "@/lib/api"
import { COUNTRY_OPTIONS } from "@/lib/countries"
import { ArrowLeft, ArrowRight, Bell, Box, Check, ChevronDown, CircleAlert, CircleHelp, Globe2, Info, Loader2, PackagePlus, RefreshCw, ShieldAlert, Sparkles } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"

const STORAGE_KEY = "supplyguard:draft-item"
const POLL_INTERVAL_MS = 1_500
const MAX_POLL_ATTEMPTS = 40

type ItemForm = {
  // 화면에서 편집되는 품목 등록 데이터의 형태입니다.
  name: string
  hsCode: string
  quantity: string
  targetPrice: string
  countries: string[]
  deliveryDate: string
  supplierNotes: string
  priority: string
}

const initialForm: ItemForm = {
  name: "",
  hsCode: "",
  quantity: "",
  targetPrice: "",
  countries: [],
  deliveryDate: "",
  supplierNotes: "",
  priority: "high",
}

export default function NewItemPage() {
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<ItemForm>(initialForm)
  const [countryInput, setCountryInput] = useState("")
  const [isCountryListOpen, setIsCountryListOpen] = useState(false)
  const [error, setError] = useState("")
  const [createdItem, setCreatedItem] = useState<QueryOut | null>(null)
  const [buildStatus, setBuildStatus] = useState<"idle" | "pending" | "done" | "error">("idle")
  const [buildProgress, setBuildProgress] = useState(0)
  const [buildResult, setBuildResult] = useState<BuildItemSgriResult | null>(null)
  const [buildError, setBuildError] = useState("")
  const mountedRef = useRef(true)
  const buildRequestInFlightRef = useRef(false)

  const normalizedCountryInput = countryInput.trim().toLocaleLowerCase("ko")
  const filteredCountryOptions = COUNTRY_OPTIONS.filter(({ code, name }) =>
    !form.countries.includes(name)
    && (!normalizedCountryInput
      || code.toLowerCase().includes(normalizedCountryInput)
      || name.toLocaleLowerCase("ko").includes(normalizedCountryInput)),
  )

  useEffect(() => {
    mountedRef.current = true
    // 이전에 저장한 초안이 있으면 브라우저 저장소에서 복원합니다.
    const draft = window.localStorage.getItem(STORAGE_KEY)
    if (draft) {
      try {
        setForm({ ...initialForm, ...JSON.parse(draft) })
      } catch {
        window.localStorage.removeItem(STORAGE_KEY)
      }
    }
    return () => {
      mountedRef.current = false
    }
  }, [])

  const updateField = (field: keyof ItemForm, value: string) => {
    // 모든 텍스트 입력을 하나의 form 상태에서 관리합니다.
    setError("")
    setForm((current) => ({ ...current, [field]: value }))
  }

  const addCountry = (value = countryInput) => {
    // 빈 값과 중복 국가는 목록에 추가하지 않습니다.
    const enteredCountry = value.trim()
    const matchedCountry = COUNTRY_OPTIONS.find(({ code, name }) =>
      code.toLowerCase() === enteredCountry.toLowerCase()
      || name.toLocaleLowerCase("ko") === enteredCountry.toLocaleLowerCase("ko"),
    )
    const country = matchedCountry?.name ?? enteredCountry
    if (!country || form.countries.includes(country)) return
    setForm((current) => ({ ...current, countries: [...current.countries, country] }))
    setCountryInput("")
    setIsCountryListOpen(false)
  }

  const removeCountry = (country: string) => {
    setForm((current) => ({ ...current, countries: current.countries.filter((item) => item !== country) }))
  }

  const saveItem = async (event: FormEvent) => {
    // 필수값을 검증한 뒤 백엔드(POST /queries)에 품목을 먼저 등록합니다.
    event.preventDefault()
    const normalizedHsCode = form.hsCode.replace(/[^0-9]/g, "")
    if (!form.name.trim() || !form.hsCode.trim() || form.countries.length === 0 || !form.deliveryDate) {
      setError("필수 항목을 모두 입력해 주세요.")
      return
    }
    if (normalizedHsCode.length < 2) {
      setError("HS 코드는 숫자 2자리 이상 입력해 주세요.")
      return
    }
    setError("")
    setSubmitting(true)
    try {
      // 등록 요청 중 새로고침해도 복원할 수 있도록 최신 초안을 저장합니다.
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
      // 납기일 → 리드타임(일수)로 환산
      const leadDays = form.deliveryDate
        ? Math.max(0, Math.round((new Date(form.deliveryDate).getTime() - Date.now()) / 86_400_000))
        : undefined
      const created = await api.createQuery({
        item_name: form.name.trim(),
        hs_code: normalizedHsCode, // "2836.91" → "283691"
        required_qty: form.quantity ? Number(form.quantity) : undefined,
        target_price: form.targetPrice ? Number(form.targetPrice) : undefined,
        qty_unit: "ton",
        lead_time_days: leadDays,
        importer_code: "KR",
      })
      setCreatedItem(created)
      window.localStorage.removeItem(STORAGE_KEY)
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.")
    } finally {
      setSubmitting(false)
    }
  }

  const startAnalysis = async () => {
    if (!createdItem || buildStatus === "pending" || buildRequestInFlightRef.current) return

    buildRequestInFlightRef.current = true
    setBuildStatus("pending")
    setBuildProgress(2)
    setBuildResult(null)
    setBuildError("")

    try {
      const started = await api.buildItemSgri(createdItem.hs_code ?? form.hsCode.replace(/[^0-9]/g, ""))
      let job = started

      for (let attempt = 0; job.status === "pending" && attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS))
        if (!mountedRef.current) return
        job = await api.getBuildJob(started.job_id)
        setBuildProgress(Math.min(95, Math.round(((attempt + 1) / MAX_POLL_ATTEMPTS) * 100)))
      }

      if (!mountedRef.current) return
      if (job.status === "error") {
        throw new Error(job.error || "품목 분석에 실패했습니다.")
      }
      if (job.status !== "done" || !job.result) {
        throw new Error("분석 시간이 길어지고 있습니다. 잠시 후 다시 시도해 주세요.")
      }
      if (job.result.error) {
        throw new Error(job.result.error)
      }

      setBuildResult(job.result)
      setBuildProgress(100)
      setBuildStatus("done")
    } catch (err) {
      if (!mountedRef.current) return
      setBuildStatus("error")
      setBuildError(err instanceof Error ? err.message : "품목 분석 중 오류가 발생했습니다.")
    } finally {
      buildRequestInFlightRef.current = false
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link>
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="relative text-slate-600"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 md:px-8">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기</Link>
        <div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><PackagePlus className="h-4 w-4" /> 공급망 등록</div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">모니터링할 품목을 등록하세요</h1><p className="mt-2 text-sm text-slate-500">품목과 조달 조건을 입력하면 AI가 공급망 위험도를 분석합니다.</p></div><Badge className="w-fit border-blue-100 bg-blue-50 px-3 py-1.5 text-blue-700 hover:bg-blue-50">{createdItem ? "2 / 2 SGRI 분석" : "1 / 2 기본 정보"}</Badge></div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <form id="item-form" onSubmit={saveItem} className="lg:col-span-2"><fieldset disabled={Boolean(createdItem)} className={createdItem ? "opacity-70" : ""}><Card className="border-slate-200 shadow-sm"><CardHeader className="border-b border-slate-100 pb-5"><CardTitle className="text-base">품목 및 조달 정보</CardTitle><CardDescription className="mt-1">{createdItem ? "품목 등록이 완료되어 입력 내용이 잠겼습니다." : "* 표시는 필수 입력 항목입니다."}</CardDescription></CardHeader><CardContent className="space-y-7 pt-6">
            <section><div className="mb-4 flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-600"><Box className="h-4 w-4" /></div><h2 className="text-sm font-semibold">품목 정보</h2></div><div className="grid gap-5 md:grid-cols-2"><Field label="품목명" required><Input placeholder="예: 리튬 탄산염" value={form.name} onChange={(event) => updateField("name", event.target.value)} /></Field><Field label="HS 코드" required helper="알고 있는 경우 입력해 주세요."><Input placeholder="예: 2836.91" value={form.hsCode} onChange={(event) => updateField("hsCode", event.target.value)} /></Field><Field label="연간 예상 수량"><Input placeholder="예: 500" type="number" min="0" value={form.quantity} onChange={(event) => updateField("quantity", event.target.value)} /><span className="absolute bottom-2.5 right-3 text-xs text-slate-400">톤</span></Field><Field label="목표 단가"><Input placeholder="예: 18,000" type="number" min="0" value={form.targetPrice} onChange={(event) => updateField("targetPrice", event.target.value)} /><span className="absolute bottom-2.5 right-3 text-xs text-slate-400">USD / 톤</span></Field></div></section>

            <div className="border-t border-slate-100" />
            <section><div className="mb-4 flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-50 text-violet-600"><Globe2 className="h-4 w-4" /></div><h2 className="text-sm font-semibold">현재 조달 현황</h2></div><div className="grid gap-5 md:grid-cols-2"><Field label="현재 주요 공급국" required><div className="relative"><div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-white p-1.5">{form.countries.map((country) => <Badge key={country} className="bg-slate-100 text-slate-600 hover:bg-slate-100">{country}<button type="button" aria-label={`${country} 삭제`} onClick={() => removeCountry(country)} className="ml-1 text-slate-400 hover:text-rose-500">×</button></Badge>)}<Input aria-label="공급국 추가" value={countryInput} onChange={(event) => { setCountryInput(event.target.value); setIsCountryListOpen(true) }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCountry() } }} placeholder="국가명 또는 코드 입력" className="h-7 min-w-24 flex-1 border-0 px-1 shadow-none focus-visible:ring-0" /><button type="button" aria-expanded={isCountryListOpen} aria-haspopup="listbox" onClick={() => setIsCountryListOpen((current) => !current)} className="flex items-center gap-1 px-1 text-xs font-medium text-blue-600">+ 추가<ChevronDown className={`h-3 w-3 transition-transform ${isCountryListOpen ? "rotate-180" : ""}`} /></button></div>{isCountryListOpen && <div role="listbox" aria-label="공급국 선택" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"><div className="flex items-center justify-between border-b border-slate-100 px-3 py-2"><span className="text-xs font-medium text-slate-700">국가 선택</span><span className="text-[11px] text-slate-400">{filteredCountryOptions.length}개</span></div><div className="max-h-56 overflow-y-auto p-1">{filteredCountryOptions.map(({ code, name }) => <button type="button" role="option" aria-selected="false" key={code} onClick={() => addCountry(name)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-blue-50 hover:text-blue-700"><span>{name}</span><span className="text-xs text-slate-400">{code}</span></button>)}{filteredCountryOptions.length === 0 && <p className="px-3 py-6 text-center text-xs text-slate-400">일치하는 국가가 없습니다.</p>}</div></div>}</div></Field><Field label="희망 납기일" required><Input type="date" value={form.deliveryDate} onChange={(event) => updateField("deliveryDate", event.target.value)} /></Field><div className="md:col-span-2"><Label className="text-sm font-medium">공급사 또는 조달 경로 <span className="text-slate-400">(선택)</span></Label><Textarea className="mt-2 min-h-24 resize-none" placeholder="현재 거래 중인 공급사명, 경유 항만, 특이사항 등을 입력하세요." value={form.supplierNotes} onChange={(event) => updateField("supplierNotes", event.target.value)} /></div></div></section>

            <div className="border-t border-slate-100" />
            <section><div className="mb-4 flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-50 text-amber-600"><CircleHelp className="h-4 w-4" /></div><h2 className="text-sm font-semibold">분석 우선순위</h2></div><div className="grid gap-3 sm:grid-cols-3">{[{ id: "high", title: "높음", description: "매일 위험 신호를 확인" }, { id: "normal", title: "보통", description: "주간 리포트로 확인" }, { id: "low", title: "낮음", description: "월간 리포트로 확인" }].map((option) => <button type="button" key={option.id} onClick={() => updateField("priority", option.id)} className={`rounded-lg border p-4 text-left transition-colors ${form.priority === option.id ? "border-blue-500 bg-blue-50/70 ring-1 ring-blue-500" : "border-slate-200 hover:border-slate-300"}`}><div className="flex items-center justify-between"><span className="text-sm font-semibold">{option.title}</span>{form.priority === option.id && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600"><Check className="h-3 w-3 text-white" /></span>}</div><p className="mt-1 text-xs text-slate-500">{option.description}</p></button>)}</div></section>
            {error && <p role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          </CardContent></Card></fieldset></form>

          <aside className="space-y-5"><Card className="border-blue-100 bg-gradient-to-br from-blue-50/80 to-cyan-50/60 shadow-sm"><CardHeader className="pb-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white"><Sparkles className="h-4 w-4" /></div><CardTitle className="mt-3 text-base">AI가 분석하는 항목</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-slate-600"><AnalysisItem text="국가·공급처 의존도" /><AnalysisItem text="수출 규제 및 지정학 리스크" /><AnalysisItem text="물류 지연과 항만 혼잡도" /><AnalysisItem text="가격 변동성과 ESG 규제" /><div className="mt-4 rounded-lg border border-blue-100 bg-white/80 p-3 text-xs leading-5 text-slate-500"><Info className="mr-1 inline h-3.5 w-3.5 text-blue-600" /> 공개 무역 통계와 뉴스 데이터를 결합해 SGRI 점수를 계산합니다.</div></CardContent></Card>
            <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">등록 후 진행 과정</CardTitle></CardHeader><CardContent><ol className="space-y-4">{["기본 위험도 분석", "고위험 이슈 뉴스 수집", "대체 공급국·기업 추천", "AI 대응 보고서 생성"].map((item, index) => <li className="flex gap-3" key={item}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{index + 1}</span><span className="pt-0.5 text-sm text-slate-600">{item}</span></li>)}</ol></CardContent></Card></aside>
        </div>

        {createdItem && (
          <Card className={`mt-6 shadow-sm ${buildStatus === "error" ? "border-rose-200" : buildStatus === "done" ? "border-emerald-200" : "border-blue-200"}`}>
            <CardContent className="p-5 md:p-6">
              {buildStatus === "idle" && (
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check className="h-5 w-5" /></span>
                  <div><p className="font-semibold text-slate-800">품목 등록이 완료되었습니다.</p><p className="mt-1 text-sm text-slate-500">이제 HS {createdItem.hs_code}의 무역 데이터를 수집하고 SGRI를 계산할 수 있습니다. 분석에는 수십 초가 걸릴 수 있습니다.</p></div>
                </div>
              )}
              {buildStatus === "pending" && (
                <div role="status" aria-live="polite">
                  <div className="flex items-start gap-3"><Loader2 className="mt-0.5 h-5 w-5 animate-spin text-blue-600" /><div><p className="font-semibold text-slate-800">품목 데이터를 분석하고 있습니다.</p><p className="mt-1 text-sm text-slate-500">다년간 무역 데이터를 수집해 국가별 SGRI를 계산합니다. 이 화면을 잠시 유지해 주세요.</p></div></div>
                  <Progress value={buildProgress} className="mt-5 h-2" />
                  <p className="mt-2 text-right text-xs font-medium text-slate-500">폴링 경과 {buildProgress}%</p>
                </div>
              )}
              {buildStatus === "done" && buildResult && (
                <div role="status" aria-live="polite" className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check className="h-5 w-5" /></span>
                  <div><p className="font-semibold text-slate-800">SGRI 분석이 완료되었습니다.</p>{buildResult.countries > 0 ? <p className="mt-1 text-sm text-slate-600">HS {buildResult.hs_code}에 대해 <span className="font-semibold text-emerald-700">{buildResult.countries}개 국가</span>의 위험도를 계산했습니다.</p> : <p className="mt-1 text-sm text-slate-500">분석은 완료됐지만 계산된 국가 결과가 없습니다. 추천 화면에서 데이터 상태를 확인해 주세요.</p>}</div>
                </div>
              )}
              {buildStatus === "error" && (
                <div role="alert" className="flex items-start gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" /><div><p className="font-semibold text-slate-800">품목 분석을 완료하지 못했습니다.</p><p className="mt-1 text-sm text-rose-700">{buildError}</p><p className="mt-1 text-xs text-slate-500">등록된 품목은 유지되므로 다시 등록할 필요가 없습니다.</p></div></div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-6"><p className="hidden text-sm text-slate-500 md:block">{createdItem ? "분석이 끝나면 해당 품목의 추천 결과로 이동할 수 있습니다." : "등록 후에도 대시보드에서 언제든 확인할 수 있습니다."}</p><div className="ml-auto flex gap-2"><Button asChild variant="outline" className="border-slate-200"><Link href={createdItem ? "/items" : "/dashboard"}>{createdItem ? "품목 목록" : "취소"}</Link></Button>{!createdItem && <Button type="submit" form="item-form" disabled={submitting} className="bg-blue-600 hover:bg-blue-700">{submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />등록 중...</> : <>품목 등록 <ArrowRight className="ml-2 h-4 w-4" /></>}</Button>}{createdItem && buildStatus === "idle" && <Button type="button" onClick={startAnalysis} className="bg-blue-600 hover:bg-blue-700">이 품목 분석 시작 <ArrowRight className="ml-2 h-4 w-4" /></Button>}{createdItem && buildStatus === "pending" && <Button type="button" disabled><Loader2 className="mr-2 h-4 w-4 animate-spin" />분석 진행 중</Button>}{createdItem && buildStatus === "error" && <Button type="button" onClick={startAnalysis} className="bg-blue-600 hover:bg-blue-700"><RefreshCw className="mr-2 h-4 w-4" />분석 다시 시도</Button>}{createdItem && buildStatus === "done" && <Button asChild className="bg-emerald-600 hover:bg-emerald-700"><Link href={`/recommendations?query_id=${createdItem.query_id}`}>추천 결과 보기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>}</div></div>
      </main>
    </div>
  )
}

function Field({ label, required, helper, children }: { label: string; required?: boolean; helper?: string; children: React.ReactNode }) {
  return <div className="relative"><Label className="text-sm font-medium">{label}{required && <span className="ml-0.5 text-rose-500">*</span>}</Label>{helper && <span className="ml-1.5 text-xs text-slate-400">{helper}</span>}<div className="relative mt-2">{children}</div></div>
}

function AnalysisItem({ text }: { text: string }) {
  return <div className="flex items-center gap-2"><Check className="h-4 w-4 text-blue-600" /><span>{text}</span></div>
}
