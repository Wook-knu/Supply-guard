"use client"

import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { api, type ReportOut, type ReportSection } from "@/lib/api"
import { ArrowLeft, Check, Download, FileText, Save, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

function normalizeSections(sections: ReportOut["sections"]): ReportSection[] {
  if (Array.isArray(sections)) return sections
  return Object.entries(sections ?? {}).map(([title, body], index) => ({ id: String(index), title, body }))
}

export default function ReportDetailPage() {
  const params = useParams<{ reportId: string }>()
  const reportId = Number(params.reportId)
  const wantEdit = useSearchParams().get("edit") === "1"  // 직접 작성 진입 시 바로 편집모드
  const [report, setReport] = useState<ReportOut | null>(null)
  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [sections, setSections] = useState<ReportSection[]>([])
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!reportId) return
    api.getReport(reportId).then((data) => {
      setReport(data)
      setTitle(data.title ?? "")
      setSummary(data.summary ?? "")
      setSections(normalizeSections(data.sections))
      if (wantEdit) setEditing(true)
    }).catch((err) => setError(err instanceof Error ? err.message : "보고서를 불러오지 못했습니다."))
  }, [reportId, wantEdit])

  async function saveReport() {
    if (!report) return
    setSaving(true)
    setSaved(false)
    setError("")
    try {
      const updated = await api.updateReport(report.report_id, { title, summary, sections })
      setReport(updated)
      setTitle(updated.title ?? "")
      setSummary(updated.summary ?? "")
      setSections(normalizeSections(updated.sections))
      setEditing(false)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "보고서 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  if (error && !report) return <div className="grid min-h-screen place-items-center bg-slate-50 p-5"><Card className="w-full max-w-lg"><CardContent className="p-8 text-center"><p className="text-sm text-rose-600">{error}</p><Button asChild variant="outline" className="mt-5"><Link href="/reports/new">보고서 목록으로</Link></Button></CardContent></Card></div>
  if (!report) return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">보고서를 불러오는 중...</div>

  return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 text-white"><ShieldAlert className="h-4 w-4" /></div><span className="font-semibold">SupplyGuard</span></Link><Button onClick={() => window.print()} variant="outline" className="no-print border-slate-200"><Download className="mr-2 h-4 w-4" />PDF 저장</Button></header>
    <main className="mx-auto max-w-5xl px-5 py-8 md:px-8"><Link href="/reports/new" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" />보고서 목록으로</Link><div className="mt-6 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div className="flex-1"><div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-600"><FileText className="h-4 w-4" />API 보고서 #{report.report_id}</div>{editing ? <Input value={title} onChange={(event) => setTitle(event.target.value)} className="max-w-3xl bg-white text-lg font-semibold" /> : <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title || `보고서 #${report.report_id}`}</h1>}<div className="mt-2 flex items-center gap-2 text-sm text-slate-500"><span>{report.created_at ? new Date(report.created_at).toLocaleString("ko-KR") : "생성 시간 없음"}</span><Badge className="border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-50">{report.status ?? "draft"}</Badge></div></div><div className="no-print flex gap-2">{editing ? <Button onClick={saveReport} disabled={saving} className="bg-blue-600 hover:bg-blue-700"><Save className="mr-2 h-4 w-4" />{saving ? "저장 중..." : "저장"}</Button> : <Button onClick={() => { setEditing(true); setSaved(false) }} className="bg-blue-600 hover:bg-blue-700">편집</Button>}</div></div>
      {saved && <div className="mt-5 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><Check className="h-4 w-4" />보고서가 API를 통해 저장되었습니다.</div>}{error && <p role="alert" className="mt-5 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <Card className="mt-6 border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">경영진 요약</CardTitle><CardDescription>현재 리스크와 우선 대응 방향</CardDescription></CardHeader><CardContent>{editing ? <div><Label htmlFor="report-summary" className="sr-only">보고서 요약</Label><Textarea id="report-summary" value={summary} onChange={(event) => setSummary(event.target.value)} className="min-h-32 resize-y leading-7" /></div> : <p className="whitespace-pre-line text-sm leading-7 text-slate-600">{summary || "작성된 요약이 없습니다."}</p>}</CardContent></Card>
      <div className="mt-6 space-y-5">{sections.map((section, index) => <Card key={section.id || index} className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">{index + 1}. {section.title}</CardTitle></CardHeader><CardContent>{editing ? <Textarea value={section.body} onChange={(event) => setSections((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, body: event.target.value } : item))} className="min-h-40 resize-y leading-7" /> : <p className="whitespace-pre-line text-sm leading-7 text-slate-600">{section.body || "작성된 내용이 없습니다."}</p>}</CardContent></Card>)}</div>
    </main></div>
}
