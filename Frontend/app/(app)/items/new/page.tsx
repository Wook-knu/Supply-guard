"use client"

// 신규 모니터링 품목 등록 — 토스식 단계별 퍼널 UX.
// 한 화면에 질문 하나 → 상단 진행바 → 하단 큰 버튼 → 예/아니요 분기.
// 마지막 "등록" 후 기존 SGRI 분석 흐름(build-sgri)으로 이어진다.

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { api, type BuildItemSgriResult, type HsCodeOut, type QueryOut } from "@/lib/api"
import { COUNTRY_OPTIONS } from "@/lib/countries"
import { ArrowLeft, ArrowRight, Check, CircleAlert, Loader2, MapPin, Pencil, RefreshCw, ShieldAlert, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const STORAGE_KEY = "supplyguard:draft-item"
const POLL_INTERVAL_MS = 1_500
const MAX_POLL_ATTEMPTS = 40

type ItemForm = {
  name: string
  hsCode: string
  quantity: string
  qtyUnit: string
  targetPrice: string
  currency: string
  countries: string[]
  deliveryDate: string
  priority: string
}

const initialForm: ItemForm = {
  name: "", hsCode: "", quantity: "", qtyUnit: "톤", targetPrice: "", currency: "USD",
  countries: [], deliveryDate: "", priority: "high",
}

const QTY_UNITS = ["톤", "kg", "개", "L", "㎥", "박스"]
const CURRENCIES = ["USD", "KRW", "EUR", "CNY", "JPY"]
const QTY_UNIT_CODE: Record<string, string> = { "톤": "ton", kg: "kg", "개": "ea", L: "l", "㎥": "m3", "박스": "box" }

const PRIORITIES = [
  { id: "high", title: "높음", desc: "매일 위험 신호를 확인해요", emoji: "🚨" },
  { id: "normal", title: "보통", desc: "주간 리포트로 확인해요", emoji: "📊" },
  { id: "low", title: "낮음", desc: "월간 리포트로 확인해요", emoji: "🗓️" },
]

// 퍼널 단계 정의
const STEPS = ["name", "origin", "specs", "priority", "review"] as const
const STEP_LABELS = ["품목", "조달 현황", "물량·단가", "모니터링", "확인"]
type Step = (typeof STEPS)[number]

export default function NewItemPage() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<ItemForm>(initialForm)
  const [hasOrigin, setHasOrigin] = useState<"yes" | "no" | null>(null)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // 등록 후 분석
  const [createdItem, setCreatedItem] = useState<QueryOut | null>(null)
  const [buildStatus, setBuildStatus] = useState<"idle" | "pending" | "done" | "error">("idle")
  const [buildProgress, setBuildProgress] = useState(0)
  const [buildResult, setBuildResult] = useState<BuildItemSgriResult | null>(null)
  const [buildError, setBuildError] = useState("")
  const mountedRef = useRef(true)
  const buildRequestInFlightRef = useRef(false)

  // HS 자동완성 + 중복 체크 + 국가 선택
  const [hsSuggestions, setHsSuggestions] = useState<HsCodeOut[]>([])
  const [showHsSuggest, setShowHsSuggest] = useState(false)
  const [showHsInput, setShowHsInput] = useState(false)
  const [existingHsCodes, setExistingHsCodes] = useState<Set<string>>(new Set())
  const hsSearchTimer = useRef<number | null>(null)
  const [countryInput, setCountryInput] = useState("")

  const current: Step = STEPS[step]

  useEffect(() => {
    mountedRef.current = true
    const draft = window.localStorage.getItem(STORAGE_KEY)
    if (draft) {
      try {
        const parsed = { ...initialForm, ...JSON.parse(draft) }
        setForm(parsed)
        if (parsed.countries?.length) setHasOrigin("yes")
      } catch { window.localStorage.removeItem(STORAGE_KEY) }
    }
    api.getQueries()
      .then((rows) => setExistingHsCodes(new Set(rows.map((r) => (r.hs_code ?? "").trim()).filter(Boolean))))
      .catch(() => {})
    return () => { mountedRef.current = false }
  }, [])

  const updateField = (field: keyof ItemForm, value: string) => {
    setError("")
    setForm((c) => ({ ...c, [field]: value }))
  }

  const onNameChange = (value: string) => {
    updateField("name", value)
    if (hsSearchTimer.current) window.clearTimeout(hsSearchTimer.current)
    const q = value.trim()
    if (q.length < 1) { setHsSuggestions([]); setShowHsSuggest(false); return }
    hsSearchTimer.current = window.setTimeout(() => {
      api.searchHsCodes(q)
        .then((rows) => { setHsSuggestions(rows); setShowHsSuggest(rows.length > 0) })
        .catch(() => setHsSuggestions([]))
    }, 250)
  }

  const pickHsSuggestion = (hs: HsCodeOut) => {
    setForm((c) => ({ ...c, name: hs.name_ko || c.name, hsCode: hs.hs_code }))
    setShowHsSuggest(false)
  }

  const addCountry = (value = countryInput) => {
    const entered = value.trim()
    const matched = COUNTRY_OPTIONS.find(({ code, name }) =>
      code.toLowerCase() === entered.toLowerCase() || name.toLocaleLowerCase("ko") === entered.toLocaleLowerCase("ko"))
    const country = matched?.name ?? entered
    if (!country || form.countries.includes(country)) return
    setForm((c) => ({ ...c, countries: [...c.countries, country] }))
    setCountryInput("")
  }

  const removeCountry = (country: string) =>
    setForm((c) => ({ ...c, countries: c.countries.filter((x) => x !== country) }))

  const normalizedCountryInput = countryInput.trim().toLocaleLowerCase("ko")
  const filteredCountryOptions = COUNTRY_OPTIONS.filter(({ code, name }) =>
    !form.countries.includes(name)
    && (!normalizedCountryInput || code.toLowerCase().includes(normalizedCountryInput) || name.toLocaleLowerCase("ko").includes(normalizedCountryInput)),
  ).slice(0, 8)

  // ── 단계 이동 ──
  const goNext = () => {
    setError("")
    if (current === "name" && !form.name.trim()) { setError("품목명을 입력해 주세요."); return }
    if (current === "origin") {
      if (hasOrigin === null) { setError("예 / 아니요를 선택해 주세요."); return }
      if (hasOrigin === "yes" && form.countries.length === 0) { setError("거래 중인 국가를 하나 이상 추가하거나 ‘아니요’를 선택하세요."); return }
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }
  const goBack = () => { setError(""); setStep((s) => Math.max(0, s - 1)) }

  const chooseNoOrigin = () => {
    setHasOrigin("no")
    setForm((c) => ({ ...c, countries: [] }))
    setError("")
    window.setTimeout(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 180)
  }

  // ── 등록 ──
  const submit = async () => {
    const hs = form.hsCode.replace(/[^0-9]/g, "")
    if (!form.name.trim()) { setStep(0); setError("품목명을 입력해 주세요."); return }
    if (hs && hs.length < 2) { setError("HS 코드는 숫자 2자리 이상이어야 합니다. (모르면 비워 두세요)"); return }
    if (hs && existingHsCodes.has(hs)) { setError(`이미 등록된 품목입니다 (HS ${hs}). 품목 목록에서 확인해 주세요.`); return }
    setError(""); setSubmitting(true)
    try {
      const leadDays = form.deliveryDate
        ? Math.max(0, Math.round((new Date(form.deliveryDate).getTime() - Date.now()) / 86_400_000))
        : undefined
      const created = await api.createQuery({
        item_name: form.name.trim(),
        hs_code: hs || undefined,
        required_qty: form.quantity ? Number(form.quantity) : undefined,
        target_price: form.targetPrice ? Number(form.targetPrice) : undefined,
        qty_unit: QTY_UNIT_CODE[form.qtyUnit] ?? "ton",
        lead_time_days: leadDays,
        importer_code: "KR",
        origin_country: form.countries.length ? form.countries.join(",") : undefined,
      })
      setCreatedItem(created)
      window.localStorage.removeItem(STORAGE_KEY)
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.")
    } finally { setSubmitting(false) }
  }

  const startAnalysis = async () => {
    if (!createdItem || buildStatus === "pending" || buildRequestInFlightRef.current) return
    buildRequestInFlightRef.current = true
    setBuildStatus("pending"); setBuildProgress(2); setBuildResult(null); setBuildError("")
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
      if (job.status === "error") throw new Error(job.error || "품목 분석에 실패했습니다.")
      if (job.status !== "done" || !job.result) throw new Error("분석 시간이 길어지고 있습니다. 잠시 후 다시 시도해 주세요.")
      if (job.result.error) throw new Error(job.result.error)
      setBuildResult(job.result); setBuildProgress(100); setBuildStatus("done")
    } catch (err) {
      if (!mountedRef.current) return
      setBuildStatus("error"); setBuildError(err instanceof Error ? err.message : "품목 분석 중 오류가 발생했습니다.")
    } finally { buildRequestInFlightRef.current = false }
  }

  const progress = createdItem ? 100 : Math.round(((step + 1) / (STEPS.length + 1)) * 100)

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-6 text-slate-900 md:items-center md:py-10">
      <div className="grid w-full max-w-4xl rounded-3xl border border-slate-200 bg-white shadow-lg md:grid-cols-[280px_1fr]">

        {/* 좌측 브랜드 + 단계 패널 (데스크톱) */}
        <aside className="hidden flex-col justify-between rounded-l-3xl bg-gradient-to-br from-blue-600 to-cyan-500 p-8 text-white md:flex">
          <div>
            <div className="mb-8 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20"><ShieldAlert className="h-4 w-4" /></div>
              <span className="font-semibold tracking-tight">SupplyGuard</span>
            </div>
            <h2 className="text-xl font-bold leading-snug">몇 가지만<br />알려주세요</h2>
            <p className="mt-3 text-sm leading-6 text-white/80">입력하신 정보로 AI가 공급망 위험도(SGRI)를 분석하고 대체 공급처를 추천해요.</p>
          </div>
          <ol className="mt-8 space-y-3.5">
            {STEP_LABELS.map((label, i) => {
              const done = createdItem ? true : i < step
              const cur = !createdItem && i === step
              return (
                <li key={label} className={`flex items-center gap-3 text-sm transition-colors ${cur ? "font-semibold text-white" : done ? "text-white/90" : "text-white/45"}`}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${cur ? "bg-white text-blue-600" : done ? "bg-white/25" : "bg-white/10"}`}>{done && !cur ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                  {label}
                </li>
              )
            })}
          </ol>
        </aside>

        {/* 우측 콘텐츠 */}
        <div className="flex min-w-0 flex-col">
          {/* 상단: 뒤로 + 진행바 */}
          <div className="flex h-14 items-center gap-3 border-b border-slate-100 px-6">
            {createdItem ? (
              <Link href="/items" aria-label="닫기" className="text-slate-400 hover:text-slate-700"><ArrowLeft className="h-5 w-5" /></Link>
            ) : step === 0 ? (
              <Link href="/dashboard" aria-label="닫기" className="text-slate-400 hover:text-slate-700"><ArrowLeft className="h-5 w-5" /></Link>
            ) : (
              <button onClick={goBack} aria-label="이전" className="text-slate-500 hover:text-slate-800"><ArrowLeft className="h-5 w-5" /></button>
            )}
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <span className="w-10 text-right text-xs font-medium text-slate-400">{createdItem ? "완료" : `${step + 1}/${STEPS.length}`}</span>
          </div>

          <div className="flex min-h-[380px] flex-1 flex-col px-6 py-8 md:px-10">
        {createdItem ? (
          <CompletionView item={createdItem} status={buildStatus} progress={buildProgress} result={buildResult} error={buildError} onStart={startAnalysis} />
        ) : (
          <div key={step} className="flex flex-1 flex-col animate-in fade-in slide-in-from-right-4 duration-300">
            {/* ── 품목명 ── */}
            {current === "name" && (
              <Step icon="📦" title="어떤 품목을 모니터링할까요?" subtitle="품목명을 입력하면 HS 코드를 자동으로 추천해 드려요.">
                <div className="relative">
                  <Input autoFocus placeholder="예: 리튬 탄산염" value={form.name}
                    onChange={(e) => onNameChange(e.target.value)}
                    onFocus={() => hsSuggestions.length > 0 && setShowHsSuggest(true)}
                    onBlur={() => window.setTimeout(() => setShowHsSuggest(false), 150)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !showHsSuggest) goNext() }}
                    autoComplete="off" className="h-14 rounded-xl text-lg" />
                  {showHsSuggest && (
                    <div role="listbox" className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                      <div className="border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-400">품목 · HS 코드 추천</div>
                      <div className="max-h-60 overflow-y-auto p-1">
                        {hsSuggestions.map((hs) => (
                          <button type="button" key={hs.hs_code} onMouseDown={(e) => { e.preventDefault(); pickHsSuggestion(hs) }}
                            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-blue-50 hover:text-blue-700">
                            <span className="truncate">{hs.name_ko || hs.name_en}</span>
                            <span className="shrink-0 text-xs font-medium text-slate-400">HS {hs.hs_code}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {/* HS 코드 (선택) */}
                <div className="mt-3">
                  {form.hsCode && !showHsInput ? (
                    <button type="button" onClick={() => setShowHsInput(true)} className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">
                      HS {form.hsCode} <Pencil className="h-3 w-3" />
                    </button>
                  ) : showHsInput || form.hsCode ? (
                    <Input placeholder="HS 코드 (선택)" value={form.hsCode} onChange={(e) => updateField("hsCode", e.target.value)} className="h-11 rounded-xl" />
                  ) : (
                    <button type="button" onClick={() => setShowHsInput(true)} className="text-sm font-medium text-slate-400 hover:text-slate-600">+ HS 코드 직접 입력 (모르면 건너뛰기)</button>
                  )}
                </div>
              </Step>
            )}

            {/* ── 현재 조달국 (예/아니요) ── */}
            {current === "origin" && (
              <Step icon="🌍" title="지금 조달하고 있는 국가가 있나요?" subtitle="현재 거래국을 알려주시면, 대체 공급국과 위험도를 비교해 드려요.">
                <div className="grid grid-cols-2 gap-3">
                  <ChoiceCard active={hasOrigin === "yes"} onClick={() => { setHasOrigin("yes"); setError("") }} emoji="✅" title="네, 있어요" desc="거래국 선택" />
                  <ChoiceCard active={hasOrigin === "no"} onClick={chooseNoOrigin} emoji="🆕" title="아니요" desc="신규로 찾는 중" />
                </div>
                {hasOrigin === "yes" && (
                  <div className="mt-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <p className="mb-2 text-sm font-medium text-slate-600">현재 거래 중인 공급국</p>
                    {form.countries.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {form.countries.map((c) => (
                          <span key={c} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">
                            <MapPin className="h-3 w-3" />{c}
                            <button type="button" onClick={() => removeCountry(c)} className="ml-0.5 text-blue-400 hover:text-rose-500">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="relative">
                      <Input value={countryInput} onChange={(e) => setCountryInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCountry() } }}
                        placeholder="국가명 또는 코드 입력 (예: 칠레, CL)" className="h-12 rounded-xl" />
                      {countryInput.trim() && filteredCountryOptions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                          <div className="max-h-52 overflow-y-auto p-1">
                            {filteredCountryOptions.map(({ code, name }) => (
                              <button type="button" key={code} onClick={() => addCountry(name)} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-blue-50 hover:text-blue-700">
                                <span>{name}</span><span className="text-xs text-slate-400">{code}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Step>
            )}

            {/* ── 물량/단가 (선택) ── */}
            {current === "specs" && (
              <Step icon="📈" title="예상 물량과 목표가가 있나요?" subtitle="선택 항목이에요. 없으면 건너뛰어도 분석에는 문제 없어요.">
                <div className="space-y-4">
                  <div>
                    <p className="mb-1.5 text-sm font-medium text-slate-600">연간 예상 수량</p>
                    <div className="relative">
                      <Input type="number" min="0" placeholder="예: 500" value={form.quantity} onChange={(e) => updateField("quantity", e.target.value)} className="h-12 rounded-xl pr-20" />
                      <select aria-label="단위" value={form.qtyUnit} onChange={(e) => updateField("qtyUnit", e.target.value)} className="absolute inset-y-0 right-1.5 my-1.5 cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-600 outline-none hover:bg-slate-100 focus:ring-2 focus:ring-blue-500">
                        {QTY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-sm font-medium text-slate-600">목표 단가</p>
                    <div className="relative">
                      <Input type="number" min="0" placeholder="예: 18,000" value={form.targetPrice} onChange={(e) => updateField("targetPrice", e.target.value)} className="h-12 rounded-xl pr-28" />
                      <div className="absolute inset-y-0 right-1.5 my-1.5 flex items-center gap-1">
                        <select aria-label="통화" value={form.currency} onChange={(e) => updateField("currency", e.target.value)} className="h-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-600 outline-none hover:bg-slate-100 focus:ring-2 focus:ring-blue-500">
                          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <span className="pr-1 text-sm text-slate-400">/ {form.qtyUnit}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-sm font-medium text-slate-600">희망 납기일 <span className="text-slate-400">(선택)</span></p>
                    <Input type="date" value={form.deliveryDate} onChange={(e) => updateField("deliveryDate", e.target.value)} className="h-12 rounded-xl" />
                  </div>
                </div>
              </Step>
            )}

            {/* ── 모니터링 빈도 ── */}
            {current === "priority" && (
              <Step icon="🔔" title="얼마나 자주 확인할까요?" subtitle="위험 신호를 알려드리는 주기를 선택하세요.">
                <div className="space-y-3">
                  {PRIORITIES.map((p) => (
                    <button type="button" key={p.id} onClick={() => updateField("priority", p.id)}
                      className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all ${form.priority === p.id ? "border-blue-500 bg-blue-50/70 ring-1 ring-blue-500" : "border-slate-200 hover:border-slate-300"}`}>
                      <span className="text-2xl">{p.emoji}</span>
                      <div className="flex-1"><p className="font-semibold">{p.title}</p><p className="text-sm text-slate-500">{p.desc}</p></div>
                      {form.priority === p.id && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600"><Check className="h-4 w-4 text-white" /></span>}
                    </button>
                  ))}
                </div>
              </Step>
            )}

            {/* ── 확인 ── */}
            {current === "review" && (
              <Step icon="✨" title="이대로 등록할까요?" subtitle="입력하신 내용을 확인하세요. 수정하려면 항목을 누르세요.">
                <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
                  <ReviewRow label="품목명" value={form.name || "—"} onEdit={() => setStep(0)} />
                  <ReviewRow label="HS 코드" value={form.hsCode || "품목명으로 자동 추천"} onEdit={() => setStep(0)} />
                  <ReviewRow label="현재 거래국" value={form.countries.length ? form.countries.join(", ") : "없음 (신규 탐색)"} onEdit={() => setStep(1)} />
                  <ReviewRow label="물량 / 목표가" value={[form.quantity && `${form.quantity}${form.qtyUnit}`, form.targetPrice && `${Number(form.targetPrice).toLocaleString()}${form.currency}`].filter(Boolean).join(" · ") || "미입력"} onEdit={() => setStep(2)} />
                  <ReviewRow label="모니터링 빈도" value={PRIORITIES.find((p) => p.id === form.priority)?.title ?? "높음"} onEdit={() => setStep(3)} />
                </div>
              </Step>
            )}

            {error && <p role="alert" className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          </div>
          )}
          </div>

          {/* 하단 버튼 (카드 내부 고정 — 단계 무관하게 위치 일정) */}
          {!createdItem && (
            <div className="border-t border-slate-100 px-6 py-4 md:px-10">
              {current === "review" ? (
                <Button onClick={submit} disabled={submitting} className="w-full rounded-xl bg-blue-600 text-base font-semibold hover:bg-blue-700" style={{ height: 52 }}>
                  {submitting ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />등록 중...</> : "품목 등록하기"}
                </Button>
              ) : (
                <Button onClick={goNext} className="w-full rounded-xl bg-blue-600 text-base font-semibold hover:bg-blue-700" style={{ height: 52 }}>
                  다음 <ArrowRight className="ml-1.5 h-5 w-5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 하위 컴포넌트 ──
function Step({ icon, title, subtitle, children }: { icon: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-6 text-4xl">{icon}</div>
      <h1 className="text-2xl font-bold leading-snug tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
      <div className="mt-8">{children}</div>
    </div>
  )
}

function ChoiceCard({ active, onClick, emoji, title, desc }: { active: boolean; onClick: () => void; emoji: string; title: string; desc: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all ${active ? "border-blue-500 bg-blue-50/70 ring-1 ring-blue-500" : "border-slate-200 hover:border-slate-300"}`}>
      <span className="text-2xl">{emoji}</span>
      <div><p className="font-semibold">{title}</p><p className="text-xs text-slate-500">{desc}</p></div>
    </button>
  )
}

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <button type="button" onClick={onEdit} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="flex items-center gap-2 text-sm font-medium text-slate-800"><span className="max-w-[15rem] truncate">{value}</span><Pencil className="h-3.5 w-3.5 shrink-0 text-slate-300" /></span>
    </button>
  )
}

function CompletionView({ item, status, progress, result, error, onStart }: {
  item: QueryOut; status: "idle" | "pending" | "done" | "error"; progress: number
  result: BuildItemSgriResult | null; error: string; onStart: () => void
}) {
  return (
    <div className="flex flex-1 flex-col animate-in fade-in duration-300">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Check className="h-8 w-8" /></div>
      <h1 className="text-2xl font-bold tracking-tight">품목 등록 완료!</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        <span className="font-medium text-slate-700">{item.item_name}</span>
        {item.hs_code ? ` (HS ${item.hs_code})` : ""} 이(가) 모니터링 목록에 추가됐어요.
      </p>

      <Card className="mt-6 border-slate-200 shadow-sm">
        <CardContent className="p-5">
          {status === "idle" && (
            item.hs_code ? (
              <div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" /><div><p className="font-semibold text-slate-800">이제 SGRI 분석을 시작할 수 있어요.</p><p className="mt-1 text-sm text-slate-500">HS {item.hs_code}의 무역 데이터를 수집해 국가별 위험도를 계산합니다. (수십 초 소요)</p></div></div>
            ) : (
              <div className="flex items-start gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" /><div><p className="font-semibold text-slate-800">HS 코드가 없어 위험도 분석은 제한돼요.</p><p className="mt-1 text-sm text-slate-500">모니터링 항목으로는 저장됐어요. 목록에서 HS를 추가하면 분석할 수 있어요.</p></div></div>
            )
          )}
          {status === "pending" && (
            <div role="status" aria-live="polite">
              <div className="flex items-start gap-3"><Loader2 className="mt-0.5 h-5 w-5 animate-spin text-blue-600" /><div><p className="font-semibold text-slate-800">공급망을 분석하고 있어요.</p><p className="mt-1 text-sm text-slate-500">다년간 무역 데이터로 국가별 SGRI를 계산합니다.</p></div></div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
          {status === "done" && result && (
            <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check className="h-5 w-5" /></span><div><p className="font-semibold text-slate-800">SGRI 분석 완료!</p>{result.countries > 0 ? <p className="mt-1 text-sm text-slate-600">HS {result.hs_code}에 대해 <span className="font-semibold text-emerald-700">{result.countries}개 국가</span>의 위험도를 계산했어요.</p> : <p className="mt-1 text-sm text-slate-500">분석은 됐지만 계산된 국가 결과가 없어요. 추천 화면에서 확인해 주세요.</p>}</div></div>
          )}
          {status === "error" && (
            <div role="alert" className="flex items-start gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" /><div><p className="font-semibold text-slate-800">분석을 완료하지 못했어요.</p><p className="mt-1 text-sm text-rose-700">{error}</p></div></div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 space-y-2.5">
        {status === "idle" && item.hs_code && (
          <Button onClick={onStart} className="w-full rounded-xl bg-blue-600 hover:bg-blue-700" style={{ height: 52 }}>이 품목 분석 시작 <ArrowRight className="ml-1.5 h-5 w-5" /></Button>
        )}
        {status === "pending" && <Button disabled className="w-full rounded-xl" style={{ height: 52 }}><Loader2 className="mr-2 h-5 w-5 animate-spin" />분석 진행 중</Button>}
        {status === "error" && <Button onClick={onStart} className="w-full rounded-xl bg-blue-600 hover:bg-blue-700" style={{ height: 52 }}><RefreshCw className="mr-2 h-4 w-4" />분석 다시 시도</Button>}
        {status === "done" && (
          <Button asChild className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700" style={{ height: 52 }}><Link href={`/recommendations?query_id=${item.query_id}`}>추천 결과 보기 <ArrowRight className="ml-1.5 h-5 w-5" /></Link></Button>
        )}
        <Button asChild variant="ghost" className="w-full text-slate-500"><Link href="/items">품목 목록으로</Link></Button>
      </div>
    </div>
  )
}
