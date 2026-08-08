"use client"

// 대응 보고서 만들기 — 품목 등록과 같은 단계별 퍼널 UX.
// 단계: 대상 품목 → 유형 → 목차 → 추가 요청 → 확인 → (AI 초안 생성 / 직접 작성)

import Link from "next/link"
import BackLink from "@/components/back-link"
import { useRouter } from "next/navigation"
import { Fragment, useEffect, useState } from "react"
import UserAvatar from "@/components/user-avatar"
import AlertBell from "@/components/alert-bell"
import { api, type QueryOut, type ReportOut } from "@/lib/api"
import { COUNTRY_OPTIONS, getCountryName } from "@/lib/countries"
import { ArrowRight, Check, CheckCircle2, Download, FileCheck2, Loader2, PencilLine, ShieldAlert, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"

const REPORT_SECTIONS = [
  { id: "summary", title: "경영진 요약", description: "현재 위험도와 우선 대응 사항을 한 페이지로 요약" },
  { id: "risk", title: "공급망 리스크 분석", description: "국가·품목별 SGRI 점수와 주요 위험 원인" },
  { id: "alternative", title: "대체 공급국 제안", description: "대체 국가 후보 및 추천 근거" },
  { id: "companies", title: "추천 기업(공급사)", description: "국가별 추천 기업 후보와 적합도" },
  { id: "action", title: "권장 대응 전략", description: "단기·중기 실행 항목과 검토 우선순위" },
]
const REPORT_TYPES = [
  { id: "risk", title: "공급망 리스크 대응", desc: "위험도·대체안·대응전략 종합", emoji: "🛡️" },
  { id: "exec", title: "경영진 요약", desc: "핵심 리스크와 결정 사항 요약", emoji: "📋" },
  { id: "sourcing", title: "대체 공급 검토", desc: "대체 국가·기업 후보 비교 중심", emoji: "🌍" },
]
const STEPS = ["item", "country", "type", "sections", "notes", "review"] as const
const STEP_LABELS = ["대상 품목", "대상 국가", "유형", "목차", "추가 요청", "확인"]
type Step = (typeof STEPS)[number]

export default function NewReportPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [items, setItems] = useState<QueryOut[]>([])
  const [qid, setQid] = useState<number | null>(null)
  const [typeId, setTypeId] = useState("risk")
  const [reportCountry, setReportCountry] = useState("")   // 보고서 포커스 국가(코드), ""=전체
  const [countryOpts, setCountryOpts] = useState<{ code: string; name: string; sgri: number }[]>([])
  const [sections, setSections] = useState(REPORT_SECTIONS.map((s) => s.id))
  const [notes, setNotes] = useState("")

  const [loading, setLoading] = useState(false)
  const [creatingBlank, setCreatingBlank] = useState(false)
  const [aiReport, setAiReport] = useState<ReportOut | null>(null)
  const [recentReports, setRecentReports] = useState<ReportOut[]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    api.getReports().then(setRecentReports).catch(() => setRecentReports([]))
    api.getQueries().then((qs) => {
      const withHs = qs.filter((q) => q.hs_code)
      setItems(withHs)
      const urlQid = Number(new URLSearchParams(window.location.search).get("query_id"))
      setQid(urlQid || withHs[0]?.query_id || null)
    }).catch(() => {})
  }, [])

  const current: Step = STEPS[step]
  const selectedItem = items.find((i) => i.query_id === qid)

  // 선택 품목의 후보 국가 로드 + 대상 국가 기본값(거래중 → 관심 → 1순위)
  useEffect(() => {
    if (!qid || !selectedItem) return
    const toCode = (n: string) => COUNTRY_OPTIONS.find((o) => o.name === n.trim() || o.code === n.trim().toUpperCase())?.code
    const trading = (selectedItem.trading_country ?? "").split(",").map((s) => s.trim()).filter(Boolean).map(toCode).filter(Boolean) as string[]
    const origin = (selectedItem.origin_country ?? "").split(",").map((s) => s.trim()).filter(Boolean).map(toCode).filter(Boolean) as string[]
    api.getCountryRecos(qid).then((rows) => {
      const opts = rows.map((r) => ({ code: r.country_code, name: getCountryName(r.country_code), sgri: Math.round(Number(r.sgri_score ?? 0)) }))
      setCountryOpts(opts)
      setReportCountry((prev) => (prev && opts.some((o) => o.code === prev)) ? prev : (trading[0] ?? origin[0] ?? opts[0]?.code ?? ""))
    }).catch(() => { setCountryOpts([]); setReportCountry(trading[0] ?? origin[0] ?? "") })
  }, [qid, selectedItem])

  const selectedType = REPORT_TYPES.find((t) => t.id === typeId) ?? REPORT_TYPES[0]
  const itemLabel = selectedItem ? (selectedItem.item_name?.trim() || `HS ${selectedItem.hs_code}`) : "품목 미선택"
  const reportTitle = `${selectedItem ? itemLabel + " " : ""}${selectedType.title} 보고서`

  function toggleSection(id: string) { setSections((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) }

  const goNext = () => {
    setError("")
    if (current === "item" && !qid) { setError("대상 품목을 선택해 주세요."); return }
    if (current === "sections" && sections.length === 0) { setError("목차를 하나 이상 선택해 주세요."); return }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }
  const goBack = () => { setError(""); setStep((s) => Math.max(0, s - 1)) }

  async function startBlankReport() {
    setCreatingBlank(true); setError("")
    try {
      const report = await api.createReport({ title: "새 보고서 (직접 작성)" })
      router.push(`/reports/${report.report_id}?edit=1`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "빈 보고서 생성에 실패했습니다.")
      setCreatingBlank(false)
    }
  }

  async function handleGenerate() {
    setLoading(true); setError(""); setAiReport(null)
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    try {
      if (!qid) {  // 품목 없으면 빈 초안
        const report = await api.createReport({ title: reportTitle.trim() || undefined })
        setAiReport(report)
        setRecentReports((cur) => [report, ...cur.filter((r) => r.report_id !== report.report_id)])
        return
      }
      const { job_id } = await api.analyzeQuery(qid, reportCountry || undefined)
      let job = await api.getAnalyzeJob(job_id)
      for (let tries = 0; job.status === "pending" && tries < 40; tries++) {
        await sleep(1500)
        job = await api.getAnalyzeJob(job_id)
      }
      if (job.status === "error") throw new Error(job.error || "분석에 실패했습니다.")
      if (job.status !== "done" || !job.result?.report_id) throw new Error("분석 시간이 초과되었습니다.")
      const report = await api.getReport(job.result.report_id)
      setAiReport(report)
      setRecentReports((cur) => [report, ...cur.filter((r) => r.report_id !== report.report_id)])
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성 중 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center justify-between lg:justify-end border-b border-slate-200 bg-white px-6"><Link href="/dashboard" className="flex items-center gap-2.5 lg:hidden"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link><div className="flex items-center gap-3"><AlertBell /><UserAvatar /></div></header>

    <main className="mx-auto max-w-3xl px-5 py-8 md:px-8">
      <BackLink />
      <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><FileCheck2 className="h-4 w-4" /> AI 보고서 생성</div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">대응 보고서 만들기</h1>
          <p className="mt-2 text-sm text-slate-500">단계별로 고르면 AI가 SGRI·추천 데이터로 초안을 씁니다.</p>
        </div>
        {!aiReport && <Button onClick={startBlankReport} disabled={creatingBlank} variant="outline" className="w-fit border-slate-200">{creatingBlank ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PencilLine className="mr-2 h-4 w-4" />}빈 보고서로 직접 작성</Button>}
      </div>

      {/* 가로 스테퍼 */}
      {!aiReport && (
        <div className="mt-8 flex items-center">
          {STEP_LABELS.map((label, i) => (
            <Fragment key={label}>
              <div className="flex items-center gap-2">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 ${i === step ? "scale-110 bg-blue-600 text-white shadow-sm shadow-blue-500/30" : i < step ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400"}`}>{i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                <span className={`hidden text-sm sm:inline ${i === step ? "font-semibold text-slate-800" : "text-slate-400"}`}>{label}</span>
              </div>
              {i < STEP_LABELS.length - 1 && <div className="mx-2 h-px flex-1 bg-slate-200" />}
            </Fragment>
          ))}
        </div>
      )}

      {aiReport ? (
        <>
          <AiReportPreview report={aiReport} />
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="outline" className="border-slate-200" onClick={() => { setAiReport(null); setStep(0) }}>새 보고서 만들기</Button>
            <Button asChild variant="ghost" className="text-slate-500"><Link href="/items">품목 목록으로</Link></Button>
          </div>
        </>
      ) : (
        <>
          <Card className="mt-6 border-slate-200 shadow-sm">
            <CardContent className="min-h-[320px] p-6 md:p-8">
              <div key={step} className="animate-in fade-in slide-in-from-bottom-3 duration-500 ease-out">
                {/* 1. 대상 품목 */}
                {current === "item" && (
                  <StepHead icon="📦" title="어떤 품목의 보고서를 만들까요?" subtitle="분석·추천 데이터가 있는 등록 품목에서 선택하세요.">
                    {items.length > 0 ? (
                      <div className="space-y-2.5">
                        {items.map((it) => (
                          <button key={it.query_id} type="button" onClick={() => { setQid(it.query_id); setError("") }}
                            className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition-all duration-200 active:scale-[0.99] ${qid === it.query_id ? "border-blue-500 bg-blue-50/70 ring-1 ring-blue-500" : "border-slate-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"}`}>
                            <div><p className="font-semibold">{it.item_name?.trim() || `HS ${it.hs_code}`}</p><p className="mt-0.5 text-xs text-slate-400">HS {it.hs_code}</p></div>
                            {qid === it.query_id && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600"><Check className="h-4 w-4 text-white" /></span>}
                          </button>
                        ))}
                      </div>
                    ) : <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">등록된 품목이 없습니다. <Link href="/items/new" className="font-medium text-blue-600 hover:underline">품목을 먼저 등록</Link>하거나, ‘빈 보고서로 직접 작성’을 이용하세요.</div>}
                  </StepHead>
                )}

                {/* 1-2. 대상 국가 */}
                {current === "country" && (
                  <StepHead icon="🌍" title="어느 국가를 중심으로 쓸까요?" subtitle="선택 국가의 SGRI·후보 기업을 중심으로 보고서를 작성합니다.">
                    {countryOpts.length > 0 ? (
                      <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                        <button type="button" onClick={() => setReportCountry("")} className={`flex items-center justify-between rounded-2xl border p-3.5 text-left transition-all ${reportCountry === "" ? "border-blue-500 bg-blue-50/70 ring-1 ring-blue-500" : "border-slate-200 hover:border-blue-300"}`}><span className="text-sm font-medium">전체 후보국 기준</span>{reportCountry === "" && <Check className="h-4 w-4 text-blue-600" />}</button>
                        {countryOpts.map((c) => (
                          <button key={c.code} type="button" onClick={() => setReportCountry(c.code)} className={`flex items-center justify-between rounded-2xl border p-3.5 text-left transition-all ${reportCountry === c.code ? "border-blue-500 bg-blue-50/70 ring-1 ring-blue-500" : "border-slate-200 hover:border-blue-300"}`}>
                            <span className="text-sm font-medium">{c.name} <span className="ml-1 text-xs text-slate-400">SGRI {c.sgri}</span></span>{reportCountry === c.code && <Check className="h-4 w-4 text-blue-600" />}
                          </button>
                        ))}
                      </div>
                    ) : <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">이 품목의 후보 국가가 없습니다. ‘전체’ 기준으로 작성됩니다.</p>}
                  </StepHead>
                )}

                {/* 2. 유형 */}
                {current === "type" && (
                  <StepHead icon="🗂️" title="어떤 유형의 보고서인가요?" subtitle="유형에 따라 강조점과 제목이 달라집니다.">
                    <div className="space-y-3">
                      {REPORT_TYPES.map((t) => (
                        <button key={t.id} type="button" onClick={() => setTypeId(t.id)}
                          className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all duration-200 active:scale-[0.99] ${typeId === t.id ? "border-blue-500 bg-blue-50/70 ring-1 ring-blue-500" : "border-slate-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"}`}>
                          <span className="text-2xl">{t.emoji}</span>
                          <div className="flex-1"><p className="font-semibold">{t.title}</p><p className="text-sm text-slate-500">{t.desc}</p></div>
                          {typeId === t.id && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600"><Check className="h-4 w-4 text-white" /></span>}
                        </button>
                      ))}
                    </div>
                  </StepHead>
                )}

                {/* 3. 목차 */}
                {current === "sections" && (
                  <StepHead icon="📑" title="어떤 목차를 포함할까요?" subtitle="선택한 항목을 AI가 근거 데이터와 함께 작성합니다.">
                    <div className="space-y-2">
                      {REPORT_SECTIONS.map((s, index) => (
                        <label key={s.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 transition-colors ${sections.includes(s.id) ? "border-blue-300 bg-blue-50/50" : "border-slate-200 hover:bg-slate-50"}`}>
                          <Checkbox checked={sections.includes(s.id)} onCheckedChange={() => toggleSection(s.id)} />
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-500">{index + 1}</div>
                          <div><p className="text-sm font-medium">{s.title}</p><p className="mt-0.5 text-xs text-slate-500">{s.description}</p></div>
                        </label>
                      ))}
                    </div>
                  </StepHead>
                )}

                {/* 4. 추가 요청 */}
                {current === "notes" && (
                  <StepHead icon="✍️" title="추가로 강조할 내용이 있나요?" subtitle="선택 항목이에요. 없으면 건너뛰어도 됩니다.">
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-32 resize-none rounded-xl" placeholder="예: 특정 국가 리스크 강조, 사내 검토 관점, 원하는 톤 등" />
                  </StepHead>
                )}

                {/* 5. 확인 */}
                {current === "review" && (
                  <StepHead icon="✨" title="이대로 생성할까요?" subtitle="AI가 초안을 작성합니다. 생성 후 자유롭게 수정·PDF 저장할 수 있어요.">
                    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
                      <ReviewRow label="대상 품목" value={itemLabel} />
                      <ReviewRow label="대상 국가" value={reportCountry ? getCountryName(reportCountry) : "전체 후보국"} />
                      <ReviewRow label="보고서 유형" value={selectedType.title} />
                      <ReviewRow label="제목" value={reportTitle} />
                      <ReviewRow label="포함 목차" value={`${sections.length}개 · ${REPORT_SECTIONS.filter((s) => sections.includes(s.id)).map((s) => s.title).join(", ")}`} />
                      <ReviewRow label="추가 요청" value={notes.trim() || "없음"} />
                    </div>
                  </StepHead>
                )}

                {error && <p role="alert" className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
              </div>
            </CardContent>
          </Card>

          {/* 하단 네비 */}
          <div className="mt-6 flex items-center justify-between">
            {step === 0 ? <Button asChild variant="outline" className="border-slate-200"><Link href="/items">취소</Link></Button>
              : <Button variant="outline" onClick={goBack} className="border-slate-200">이전</Button>}
            {current === "review" ? (
              <Button onClick={handleGenerate} disabled={loading} className="bg-blue-600 shadow-sm shadow-blue-500/20 hover:bg-blue-700">{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />AI가 작성 중...</> : <><Sparkles className="mr-2 h-4 w-4" />AI 초안 생성</>}</Button>
            ) : (
              <Button onClick={goNext} className="bg-blue-600 shadow-sm shadow-blue-500/20 hover:bg-blue-700">다음 <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
            )}
          </div>
        </>
      )}

      {/* 최근 보고서 */}
      <Card className="mt-8 border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">최근 보고서</CardTitle><CardDescription className="mt-1">저장된 보고서를 최신순으로 표시합니다.</CardDescription></CardHeader><CardContent className="space-y-3">{recentReports.map((report) => <Link href={`/reports/${report.report_id}`} key={report.report_id} className="flex items-center justify-between rounded-lg border border-slate-200 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-md active:scale-[0.99]"><div><p className="text-sm font-medium">{report.title ?? `보고서 #${report.report_id}`}</p><p className="mt-1 text-xs text-slate-500">{report.created_at ? new Date(report.created_at).toLocaleString("ko-KR") : "생성 시간 없음"} · {report.status ?? "draft"}</p></div><ArrowRight className="h-4 w-4 text-slate-400" /></Link>)}{recentReports.length === 0 && <p className="py-6 text-center text-sm text-slate-400">저장된 보고서가 없습니다.</p>}</CardContent></Card>
    </main>
  </div>
}

function StepHead({ icon, title, subtitle, children }: { icon: string; title: string; subtitle: string; children: React.ReactNode }) {
  return <div><div className="mb-5 text-4xl">{icon}</div><h2 className="text-2xl font-bold leading-snug tracking-tight">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p><div className="mt-7">{children}</div></div>
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3 px-4 py-3.5 text-left"><span className="shrink-0 text-sm text-slate-400">{label}</span><span className="max-w-[70%] text-right text-sm font-medium text-slate-800">{value}</span></div>
}

function AiReportPreview({ report }: { report: ReportOut }) {
  const sections = Array.isArray(report.sections)
    ? report.sections
    : Object.entries(report.sections ?? {}).map(([title, body], index) => ({ id: String(index), title, body }))
  return <Card className="print-area mt-6 border-emerald-100 shadow-sm">
    <CardHeader className="flex flex-row items-start justify-between space-y-0 border-b border-slate-100 pb-5">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> AI 초안 생성 완료</div>
        <CardTitle className="text-lg">{report.title}</CardTitle>
        <CardDescription className="mt-1">{report.summary} · 상태: {report.status}</CardDescription>
      </div>
      <div className="flex gap-2"><Button asChild variant="outline" className="border-slate-200"><Link href={`/reports/${report.report_id}`}><PencilLine className="mr-2 h-4 w-4" />초안 편집</Link></Button><Button onClick={() => window.print()} variant="outline" className="no-print border-slate-200"><Download className="mr-2 h-4 w-4" />PDF 저장</Button></div>
    </CardHeader>
    <CardContent className="space-y-5 p-6">
      {sections.length === 0 && <p className="text-sm text-slate-500">생성된 섹션이 없습니다.</p>}
      {sections.map((section, index) => <div className="rounded-lg border border-slate-200 bg-slate-50 p-5" key={section.id ?? index}>
        <div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600">{index + 1}</span><p className="text-sm font-semibold">{section.title}</p></div>
        <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{section.body}</p>
      </div>)}
    </CardContent>
  </Card>
}
