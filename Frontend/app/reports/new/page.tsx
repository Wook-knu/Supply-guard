"use client"

// AI 보고서 생성·목록 API와 비동기 분석 작업을 연결한 화면입니다.

import Link from "next/link"
import { useEffect, useState } from "react"
import { api, type ReportOut } from "@/lib/api"
import { ArrowLeft, ArrowRight, Bell, Bot, Check, CheckCircle2, ChevronDown, Download, FileCheck2, FileText, Globe2, PencilLine, ShieldAlert, Sparkles } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const reportSections = [
  { id: "summary", title: "경영진 요약", description: "현재 위험도와 우선 대응 사항을 한 페이지로 요약" },
  { id: "risk", title: "공급망 리스크 분석", description: "국가·품목별 SGRI 점수와 주요 위험 원인" },
  { id: "alternative", title: "대체 공급처 제안", description: "호주·칠레·캐나다 후보 및 추천 근거" },
  { id: "action", title: "권장 대응 전략", description: "단기·중기 실행 항목과 검토 우선순위" },
]

export default function NewReportPage() {
  const [sections, setSections] = useState(reportSections.map((section) => section.id))
  const [title, setTitle] = useState("2026년 7월 리튬 탄산염 공급망 리스크 보고서")
  const [loading, setLoading] = useState(false)
  const [aiReport, setAiReport] = useState<ReportOut | null>(null)
  const [recentReports, setRecentReports] = useState<ReportOut[]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    api.getReports().then(setRecentReports).catch(() => setRecentReports([]))
  }, [])

  function toggleSection(id: string) { setSections((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }

  async function handleGenerate() {
    // URL의 query_id로 백엔드 AI 분석을 실행하고 생성된 보고서를 불러온다.
    const qid = Number(new URLSearchParams(window.location.search).get("query_id"))
    setLoading(true); setError(""); setAiReport(null)
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    try {
      if (!qid) {
        const report = await api.createReport({ title: title.trim() || undefined })
        setAiReport(report)
        setRecentReports((current) => [report, ...current.filter((item) => item.report_id !== report.report_id)])
        return
      }
      // 202로 작업 시작 → 완료까지 폴링 (최대 ~60초)
      const { job_id } = await api.analyzeQuery(qid)
      let job = await api.getAnalyzeJob(job_id)
      for (let tries = 0; job.status === "pending" && tries < 40; tries++) {
        await sleep(1500)
        job = await api.getAnalyzeJob(job_id)
      }
      if (job.status === "error") throw new Error(job.error || "분석에 실패했습니다.")
      if (job.status !== "done" || !job.result?.report_id) throw new Error("분석 시간이 초과되었습니다.")
      const report = await api.getReport(job.result.report_id)
      setAiReport(report)
      setRecentReports((current) => [report, ...current.filter((item) => item.report_id !== report.report_id)])
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성 중 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="relative text-slate-600"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div></header>
    <main className="mx-auto max-w-6xl px-5 py-8 md:px-8"><Link href="/recommendations" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 추천 결과로 돌아가기</Link><div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><FileCheck2 className="h-4 w-4" /> AI 보고서 생성</div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">대응 보고서 초안 만들기</h1><p className="mt-2 text-sm text-slate-500">분석 결과를 바탕으로 사내 검토용 공급망 리스크 보고서를 생성합니다.</p></div><Badge className="w-fit border-violet-100 bg-violet-50 px-3 py-1.5 text-violet-700 hover:bg-violet-50">2 / 2 보고서 구성</Badge></div>

      <div className="mt-7 grid gap-6 lg:grid-cols-3"><div className="space-y-6 lg:col-span-2"><Card className="border-slate-200 shadow-sm"><CardHeader className="border-b border-slate-100 pb-5"><CardTitle className="text-base">보고서 기본 정보</CardTitle><CardDescription className="mt-1">생성된 보고서는 초안 상태로 저장되며, 검토 후 공유할 수 있습니다.</CardDescription></CardHeader><CardContent className="space-y-5 pt-6"><div><Label className="text-sm font-medium">보고서 제목</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2" /></div><div className="grid gap-5 md:grid-cols-2"><div><Label className="text-sm font-medium">분석 대상 품목</Label><div className="mt-2 flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium">리튬 탄산염 <span className="ml-2 text-xs font-normal text-slate-400">HS 2836.91</span></div></div><div><Label className="text-sm font-medium">보고서 유형</Label><div className="mt-2 flex h-10 items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-sm"><span>공급망 리스크 대응 보고서</span><ChevronDown className="h-4 w-4 text-slate-400" /></div></div></div><div><Label className="text-sm font-medium">추가 요청 사항 <span className="font-normal text-slate-400">(선택)</span></Label><Textarea className="mt-2 min-h-24 resize-none" placeholder="강조하고 싶은 위험 요인, 사내 검토 관점 등을 입력하세요." /></div></CardContent></Card>
        <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">포함할 목차</CardTitle><CardDescription className="mt-1">필요한 항목을 선택하면 AI가 근거 데이터와 함께 초안을 작성합니다.</CardDescription></CardHeader><CardContent className="space-y-2">{reportSections.map((section, index) => <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent p-3 hover:border-slate-200 hover:bg-slate-50" key={section.id}><Checkbox checked={sections.includes(section.id)} onCheckedChange={() => toggleSection(section.id)} /><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-500">{index + 1}</div><div><p className="text-sm font-medium">{section.title}</p><p className="mt-0.5 text-xs text-slate-500">{section.description}</p></div></label>)}</CardContent></Card></div>
        <aside className="space-y-5"><Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-sm"><CardHeader className="pb-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white"><Bot className="h-4 w-4" /></div><CardTitle className="mt-3 text-base">AI 작성 기준</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-slate-600"><Item text="SGRI 점수와 항목별 근거 반영" /><Item text="최신 뉴스·정책 변화 요약" /><Item text="대체 공급국 비교 및 제안" /><Item text="실행 가능한 대응 전략 구성" /><p className="border-t border-blue-100 pt-3 text-xs leading-5 text-slate-500">보고서는 의사결정을 돕는 초안입니다. 실제 계약·조달 전에는 담당자의 최종 검토가 필요합니다.</p></CardContent></Card><Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">분석 데이터</CardTitle></CardHeader><CardContent className="space-y-3"><Data text="현재 공급국" value="중국" /><Data text="현재 SGRI" value="82 · 고위험" danger /><Data text="추천 대체국" value="호주 외 2개" /><Data text="반영된 뉴스" value="최근 24시간 7건" /></CardContent></Card></aside></div>

      <section className="mt-6 flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center"><div><p className="font-semibold">선택된 목차 {sections.length}개</p><p className="mt-1 text-sm text-slate-500">생성 후 본문을 자유롭게 수정하고 PDF로 내보낼 수 있습니다.</p></div><Button onClick={handleGenerate} disabled={sections.length === 0 || loading} className="w-fit bg-blue-600 hover:bg-blue-700">{loading ? <>AI가 작성 중...</> : aiReport ? <><Check className="mr-2 h-4 w-4" />초안 생성 완료</> : <><Sparkles className="mr-2 h-4 w-4" />AI 초안 생성</>}</Button></section>
      {error && <p role="alert" className="mt-4 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {aiReport && <AiReportPreview report={aiReport} />}
      <Card className="mt-6 border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">최근 보고서</CardTitle><CardDescription>저장된 보고서를 최신순으로 표시합니다.</CardDescription></CardHeader><CardContent className="space-y-3">{recentReports.map((report) => <Link href={`/reports/${report.report_id}`} key={report.report_id} className="flex items-center justify-between rounded-lg border border-slate-200 p-4 hover:border-blue-200 hover:bg-blue-50/40"><div><p className="text-sm font-medium">{report.title ?? `보고서 #${report.report_id}`}</p><p className="mt-1 text-xs text-slate-500">{report.created_at ? new Date(report.created_at).toLocaleString("ko-KR") : "생성 시간 없음"} · {report.status ?? "draft"}</p></div><ArrowRight className="h-4 w-4 text-slate-400" /></Link>)}{recentReports.length === 0 && <p className="py-6 text-center text-sm text-slate-400">저장된 보고서가 없습니다.</p>}</CardContent></Card>
    </main>
  </div>
}

function AiReportPreview({ report }: { report: ReportOut }) {
  // 백엔드(AI_Model+Gemini)가 생성한 실제 보고서를 섹션별로 표시한다.
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

function Item({ text }: { text: string }) { return <div className="flex items-center gap-2"><Check className="h-4 w-4 text-blue-600" /><span>{text}</span></div> }
function Data({ text, value, danger }: { text: string; value: string; danger?: boolean }) { return <div className="flex items-center justify-between text-sm"><span className="text-slate-500">{text}</span><span className={`font-medium ${danger ? "text-rose-600" : "text-slate-800"}`}>{value}</span></div> }
function ReportPreview({ title, sections }: { title: string; sections: string[] }) { const included = reportSections.filter((section) => sections.includes(section.id)); return <Card className="mt-6 border-emerald-100 shadow-sm"><CardHeader className="flex flex-row items-start justify-between space-y-0 border-b border-slate-100 pb-5"><div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> 초안 생성 완료</div><CardTitle className="text-lg">{title}</CardTitle><CardDescription className="mt-1">자동 저장됨 · 방금 전</CardDescription></div><Button asChild variant="outline" className="border-slate-200"><Link href="/reports/july-lithium-risk"><PencilLine className="mr-2 h-4 w-4" />초안 편집</Link></Button></CardHeader><CardContent className="p-6"><div className="rounded-lg border border-slate-200 bg-slate-50 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Executive preview</p><p className="mt-3 text-sm leading-7 text-slate-600"><span className="font-semibold text-slate-900">핵심 요약.</span> 중국산 리튬 탄산염의 수출 규제 관련 위험이 상승하여 조달 다변화가 필요합니다. 호주는 공급 안정성과 ESG 기준 측면에서 가장 적합한 대체 국가이며, 칠레는 가격 경쟁력 측면에서 병행 검토를 권장합니다.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{included.map((section, index) => <div className="flex items-center gap-3 rounded-md bg-white p-3" key={section.id}><span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600">{index + 1}</span><span className="text-sm font-medium">{section.title}</span><Check className="ml-auto h-4 w-4 text-emerald-600" /></div>)}</div></div><div className="mt-5 flex justify-end"><Button asChild className="bg-blue-600 hover:bg-blue-700"><Link href="/reports/july-lithium-risk">보고서 열기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div></CardContent></Card> }
