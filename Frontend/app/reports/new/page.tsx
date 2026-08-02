"use client"

// AI 보고서 생성·목록 API와 비동기 분석 작업을 연결한 화면입니다.

import Link from "next/link"
import { useEffect, useState } from "react"
import { api, isUpgradeRequiredError, type ItemBenchmark, type ReportOut } from "@/lib/api"
import { ArrowLeft, ArrowRight, Bell, Bot, Check, CheckCircle2, ChevronDown, Clock3, Download, FileCheck2, Loader2, PencilLine, ShieldAlert, Sparkles } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"

const reportSections = [
  { id: "summary", title: "경영진 요약", description: "현재 위험도와 우선 대응 사항을 한 페이지로 요약" },
  { id: "risk", title: "공급망 리스크 분석", description: "국가·품목별 SGRI 점수와 주요 위험 원인" },
  { id: "alternative", title: "대체 공급처 제안", description: "호주·칠레·캐나다 후보 및 추천 근거" },
  { id: "action", title: "권장 대응 전략", description: "단기·중기 실행 항목과 검토 우선순위" },
]

export default function NewReportPage() {
  const [sections, setSections] = useState(reportSections.map((section) => section.id))
  const [title, setTitle] = useState("공급망 리스크 대응 보고서")
  const [loading, setLoading] = useState(false)
  const [aiReport, setAiReport] = useState<ReportOut | null>(null)
  const [recentReports, setRecentReports] = useState<ReportOut[]>([])
  const [error, setError] = useState("")
  const [upgradeMessage, setUpgradeMessage] = useState("")
  const [canUseAiReports, setCanUseAiReports] = useState<boolean | null>(null)
  const [item, setItem] = useState<{ name: string; hs: string }>({ name: "", hs: "" })
  const [stats, setStats] = useState<{ sgri: number | null; level: string; alt: number }>({ sgri: null, level: "", alt: 0 })
  const [benchmark, setBenchmark] = useState<ItemBenchmark | null>(null)
  const [activeQueryId, setActiveQueryId] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [generationStage, setGenerationStage] = useState<"idle" | "starting" | "analyzing" | "writing" | "saving" | "done">("idle")
  const estimatedProgress = loading ? Math.min(92, 8 + elapsedSeconds * 1.4) : aiReport ? 100 : 0
  const backHref = activeQueryId ? `/recommendations?query_id=${activeQueryId}` : "/recommendations"

  useEffect(() => {
    api.getReports().then(setRecentReports).catch(() => setRecentReports([]))
    api.getSubscription()
      .then((state) => setCanUseAiReports(state.features.ai_reports))
      .catch(() => setCanUseAiReports(null))
  }, [])

  useEffect(() => {
    if (!loading) return
    const timer = window.setInterval(() => setElapsedSeconds((current) => current + 1), 1000)
    return () => window.clearInterval(timer)
  }, [loading])

  // 분석 대상 품목과 요약 통계를 실제 API에서 불러온다(하드코딩 데모값 대체).
  useEffect(() => {
    async function loadContext() {
      const urlQid = Number(new URLSearchParams(window.location.search).get("query_id"))
      if (urlQid) setActiveQueryId(urlQid)
      const queries = await api.getQueries().catch(() => [])
      const q = (urlQid ? queries.find((row) => row.query_id === urlQid) : undefined)
        ?? queries.find((row) => row.hs_code)
      if (!q?.hs_code) return
      setActiveQueryId(q.query_id)
      if (!urlQid) window.history.replaceState(null, "", `/reports/new?query_id=${q.query_id}`)
      setItem({ name: q.item_name ?? `HS ${q.hs_code}`, hs: q.hs_code })
      setTitle(`${q.item_name ?? `HS ${q.hs_code}`} 공급망 리스크 대응 보고서`)
      const [risks, recos, benchmarkResult] = await Promise.all([
        api.getRisks(q.hs_code).catch(() => []),
        api.getCountryRecos(q.query_id).catch(() => []),
        api.getItemBenchmark(q.hs_code).catch(() => null),
      ])
      const worst = risks.reduce((max, r) => Math.max(max, Number(r.sgri_score ?? 0)), 0)
      const level = worst >= 50 ? "고위험" : worst >= 25 ? "주의" : "안정"
      const alt = recos.filter((r) => Number(r.sgri_score ?? 0) < 25).length
      setStats({ sgri: risks.length ? Math.round(worst) : null, level, alt })
      setBenchmark(benchmarkResult?.error ? null : benchmarkResult)
    }
    loadContext()
  }, [])

  function toggleSection(id: string) { setSections((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }

  async function handleGenerate() {
    // URL의 query_id, 없으면 사용자의 최근 등록 품목으로 AI 분석을 실행한다.
    setLoading(true); setError(""); setUpgradeMessage(""); setAiReport(null); setElapsedSeconds(0); setGenerationStage("starting")
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    try {
      let qid = activeQueryId ?? Number(new URLSearchParams(window.location.search).get("query_id"))
      if (!qid) {
        // query_id가 없으면 최근 등록 품목을 찾아 그걸로 분석 (없으면 빈 초안)
        const queries = await api.getQueries().catch(() => [])
        qid = queries.find((q) => q.hs_code)?.query_id ?? 0
      }
      if (!qid) {
        throw new Error("보고서를 생성할 분석 품목이 없습니다. 품목을 먼저 등록하고 위험도 분석을 완료해 주세요.")
      }
      // 202로 작업 시작 → 완료까지 폴링 (최대 ~60초)
      setGenerationStage("analyzing")
      const { job_id } = await api.analyzeQuery(qid)
      let job = await api.getAnalyzeJob(job_id)
      for (let tries = 0; job.status === "pending" && tries < 40; tries++) {
        if (tries >= 24) setGenerationStage("saving")
        else if (tries >= 8) setGenerationStage("writing")
        await sleep(1500)
        job = await api.getAnalyzeJob(job_id)
      }
      if (job.status === "error") throw new Error(job.error || "분석에 실패했습니다.")
      if (job.status !== "done" || !job.result?.report_id) throw new Error("분석 시간이 초과되었습니다.")
      const report = await api.getReport(job.result.report_id)
      setAiReport(report)
      setRecentReports((current) => [report, ...current.filter((item) => item.report_id !== report.report_id)])
      setGenerationStage("done")
    } catch (err) {
      if (isUpgradeRequiredError(err)) {
        setUpgradeMessage(err.detail)
        setCanUseAiReports(false)
      } else {
        setError(err instanceof Error ? err.message : "생성 중 오류가 발생했습니다.")
      }
    } finally {
      setLoading(false)
    }
  }

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link><div className="flex items-center gap-3"><Button asChild variant="ghost" size="icon" className="relative text-slate-600"><Link href="/alerts" aria-label="알림 보기"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Link></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div></header>
    <main className="mx-auto max-w-6xl px-5 py-8 md:px-8"><Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 추천 결과로 돌아가기</Link><div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><FileCheck2 className="h-4 w-4" /> AI 보고서 생성</div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">대응 보고서 초안 만들기</h1><p className="mt-2 text-sm text-slate-500">분석 결과를 바탕으로 사내 검토용 공급망 리스크 보고서를 생성합니다.</p></div><Badge className="w-fit border-violet-100 bg-violet-50 px-3 py-1.5 text-violet-700 hover:bg-violet-50">2 / 2 보고서 구성</Badge></div>

      <div className="mt-7 grid gap-6 lg:grid-cols-3"><div className="space-y-6 lg:col-span-2"><Card className="border-slate-200 shadow-sm"><CardHeader className="border-b border-slate-100 pb-5"><CardTitle className="text-base">보고서 기본 정보</CardTitle><CardDescription className="mt-1">생성된 보고서는 초안 상태로 저장되며, 검토 후 공유할 수 있습니다.</CardDescription></CardHeader><CardContent className="space-y-5 pt-6"><div><Label className="text-sm font-medium">보고서 제목</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2" /></div><div className="grid gap-5 md:grid-cols-2"><div><Label className="text-sm font-medium">분석 대상 품목</Label><div className="mt-2 flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium">{item.name || "품목 미선택"} {item.hs && <span className="ml-2 text-xs font-normal text-slate-400">HS {item.hs}</span>}</div></div><div><Label className="text-sm font-medium">보고서 유형</Label><div className="mt-2 flex h-10 items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-sm"><span>공급망 리스크 대응 보고서</span><ChevronDown className="h-4 w-4 text-slate-400" /></div></div></div><div><Label className="text-sm font-medium">추가 요청 사항 <span className="font-normal text-slate-400">(선택)</span></Label><Textarea className="mt-2 min-h-24 resize-none" placeholder="강조하고 싶은 위험 요인, 사내 검토 관점 등을 입력하세요." /></div></CardContent></Card>
        <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">포함할 목차</CardTitle><CardDescription className="mt-1">필요한 항목을 선택하면 AI가 근거 데이터와 함께 초안을 작성합니다.</CardDescription></CardHeader><CardContent className="space-y-2">{reportSections.map((section, index) => <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent p-3 hover:border-slate-200 hover:bg-slate-50" key={section.id}><Checkbox checked={sections.includes(section.id)} onCheckedChange={() => toggleSection(section.id)} /><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-500">{index + 1}</div><div><p className="text-sm font-medium">{section.title}</p><p className="mt-0.5 text-xs text-slate-500">{section.description}</p></div></label>)}</CardContent></Card></div>
        <aside className="space-y-5"><Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-sm"><CardHeader className="pb-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white"><Bot className="h-4 w-4" /></div><CardTitle className="mt-3 text-base">AI 작성 기준</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-slate-600"><Item text="SGRI 점수와 항목별 근거 반영" /><Item text="최신 뉴스·정책 변화 요약" /><Item text="대체 공급국 비교 및 제안" /><Item text="실행 가능한 대응 전략 구성" /><p className="border-t border-blue-100 pt-3 text-xs leading-5 text-slate-500">보고서는 의사결정을 돕는 초안입니다. 실제 계약·조달 전에는 담당자의 최종 검토가 필요합니다.</p></CardContent></Card><Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">분석 데이터</CardTitle></CardHeader><CardContent className="space-y-3"><Data text="분석 품목" value={item.name || "-"} /><Data text="최고 SGRI" value={stats.sgri != null ? `${stats.sgri} · ${stats.level}` : "-"} danger={stats.level === "고위험"} /><Data text="안정 대체국" value={stats.alt ? `${stats.alt}개국` : "-"} /><Data text="분석 지표" value="6종 (S·C·V·L·P·E)" />{benchmark?.item_avg_sgri != null && benchmark.all_items_avg_sgri != null && <div className="border-t border-slate-100 pt-3"><p className="mb-3 text-xs font-semibold text-blue-700">전체 데이터셋 비교 근거</p><div className="space-y-3"><Data text="품목 평균" value={`${benchmark.item_avg_sgri.toFixed(1)}점`} /><Data text="전체 평균" value={`${benchmark.all_items_avg_sgri.toFixed(1)}점`} /><Data text="평균 대비" value={`${(benchmark.sgri_delta ?? 0) > 0 ? "+" : ""}${(benchmark.sgri_delta ?? 0).toFixed(1)} · ${benchmark.sgri_verdict ?? "평균 수준"}`} danger={(benchmark.sgri_delta ?? 0) >= 5} /></div><p className="mt-3 text-[10px] leading-4 text-slate-400">{benchmark.basis}</p></div>}</CardContent></Card></aside></div>

      <section className="mt-6 flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center"><div><p className="font-semibold">선택된 목차 {sections.length}개</p><p className="mt-1 text-sm text-slate-500">{canUseAiReports === false ? "AI 보고서는 Pro 이상 요금제에서 이용할 수 있습니다." : "생성 후 본문을 자유롭게 수정하고 PDF로 내보낼 수 있습니다."}</p></div>{canUseAiReports === false ? <Button asChild className="w-fit bg-blue-600 hover:bg-blue-700"><Link href="/pricing">Pro로 업그레이드 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button> : <Button onClick={handleGenerate} disabled={sections.length === 0 || loading} className="w-fit bg-blue-600 hover:bg-blue-700">{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />AI가 작성 중...</> : aiReport ? <><Check className="mr-2 h-4 w-4" />초안 생성 완료</> : <><Sparkles className="mr-2 h-4 w-4" />AI 초안 생성</>}</Button>}</section>
      {loading && <GenerationProgress stage={generationStage} elapsedSeconds={elapsedSeconds} progress={estimatedProgress} />}
      {upgradeMessage && <div role="alert" className="mt-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-amber-900">요금제 업그레이드가 필요합니다.</p><p className="mt-1 text-sm text-amber-800">{upgradeMessage}</p></div><Button asChild className="shrink-0 bg-amber-600 hover:bg-amber-700"><Link href="/pricing">요금제 보기</Link></Button></div>}
      {error && <p role="alert" className="mt-4 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {aiReport && <AiReportPreview report={aiReport} />}
      <Card className="mt-6 border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">최근 보고서</CardTitle><CardDescription>저장된 보고서를 최신순으로 표시합니다.</CardDescription></CardHeader><CardContent className="space-y-3">{recentReports.map((report) => <Link href={`/reports/${report.report_id}`} key={report.report_id} className="flex items-center justify-between rounded-lg border border-slate-200 p-4 hover:border-blue-200 hover:bg-blue-50/40"><div><p className="text-sm font-medium">{report.title ?? `보고서 #${report.report_id}`}</p><p className="mt-1 text-xs text-slate-500">{report.created_at ? new Date(report.created_at).toLocaleString("ko-KR") : "생성 시간 없음"} · {report.status ?? "draft"}</p></div><ArrowRight className="h-4 w-4 text-slate-400" /></Link>)}{recentReports.length === 0 && <p className="py-6 text-center text-sm text-slate-400">저장된 보고서가 없습니다.</p>}</CardContent></Card>
    </main>
  </div>
}

function GenerationProgress({ stage, elapsedSeconds, progress }: { stage: "idle" | "starting" | "analyzing" | "writing" | "saving" | "done"; elapsedSeconds: number; progress: number }) {
  const stages = [
    { id: "starting", label: "분석 요청 준비" },
    { id: "analyzing", label: "위험·추천 데이터 분석" },
    { id: "writing", label: "보고서 본문 작성" },
    { id: "saving", label: "초안 저장 및 마무리" },
  ] as const
  const order = stages.findIndex((item) => item.id === stage)

  return <Card className="mt-4 overflow-hidden border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 shadow-sm" aria-live="polite">
    <CardContent className="p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"><Loader2 className="h-5 w-5 animate-spin" /></span>
          <div><p className="font-semibold text-slate-900">AI가 보고서 초안을 만들고 있습니다.</p><p className="mt-1 text-sm text-slate-600">일반적으로 20~60초 정도 걸립니다. 현재 화면을 그대로 두면 완료 즉시 결과가 표시됩니다.</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-blue-100 bg-white/80 px-3 py-2 text-sm"><Clock3 className="h-4 w-4 text-blue-600" /><span className="text-slate-500">경과</span><span className="min-w-10 font-semibold tabular-nums text-slate-900">{formatElapsed(elapsedSeconds)}</span></div>
      </div>
      <div className="mt-5"><div className="mb-2 flex items-center justify-between text-xs"><span className="font-medium text-blue-700">예상 진행률</span><span className="font-semibold tabular-nums text-blue-700">{Math.round(progress)}%</span></div><Progress value={progress} className="h-2 bg-blue-100" /></div>
      <div className="mt-5 grid gap-2 sm:grid-cols-4">{stages.map((item, index) => {
        const completed = index < order
        const active = index === order
        return <div key={item.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs ${active ? "border-blue-300 bg-white font-semibold text-blue-700" : completed ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-white/70 bg-white/50 text-slate-400"}`}>{completed ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : active ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px]">{index + 1}</span>}{item.label}</div>
      })}</div>
      <p className="mt-4 text-xs text-slate-500">진행률은 서버 응답 대기 시간을 바탕으로 한 예상치이며, 데이터 양과 AI 응답 상황에 따라 달라질 수 있습니다.</p>
    </CardContent>
  </Card>
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function AiReportPreview({ report }: { report: ReportOut }) {
  // 백엔드(AI_Model+Gemini)가 생성한 실제 보고서를 섹션별로 표시한다.
  const sections = Array.isArray(report.sections)
    ? report.sections
    : Object.entries(report.sections ?? {}).map(([title, body], index) => ({ id: String(index), title, body }))
  return <Card className="print-area mt-6 border-emerald-100 shadow-sm">
    <CardHeader className="flex flex-col items-stretch justify-between gap-4 space-y-0 border-b border-slate-100 pb-5 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> AI 초안 생성 완료</div>
        <CardTitle className="break-words text-lg leading-7">{report.title}</CardTitle>
        <CardDescription className="mt-1 break-words">{report.summary} · 상태: {report.status}</CardDescription>
      </div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0"><Button asChild variant="outline" className="min-w-0 flex-1 border-slate-200 sm:flex-none"><Link href={`/reports/${report.report_id}`}><PencilLine className="mr-2 h-4 w-4" />초안 편집</Link></Button><Button onClick={() => window.print()} variant="outline" className="no-print min-w-0 flex-1 border-slate-200 sm:flex-none"><Download className="mr-2 h-4 w-4" />PDF 저장</Button></div>
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

function Item({ text }: { text: string }) { return <div className="flex items-center gap-2"><Check className="h-4 w-4 text-blue-600" /><span>{text}</span></div> }
function Data({ text, value, danger }: { text: string; value: string; danger?: boolean }) { return <div className="flex items-center justify-between text-sm"><span className="text-slate-500">{text}</span><span className={`font-medium ${danger ? "text-rose-600" : "text-slate-800"}`}>{value}</span></div> }
