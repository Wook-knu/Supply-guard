"use client"

// 로그인 사용자의 조달 검토 보드를 조회하고 새 보드를 만드는 목록 화면입니다.

import Link from "next/link"
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, CalendarDays, CircleAlert, FolderKanban, Loader2, PackageSearch, Plus, RefreshCw, ShieldAlert, Trash2, X } from "lucide-react"
import { api, type BoardOut, type QueryOut } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

function formatDate(value: string | null) {
  if (!value) return "등록일 정보 없음"
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value))
}

export default function BoardsPage() {
  const router = useRouter()
  const [boards, setBoards] = useState<BoardOut[]>([])
  const [queries, setQueries] = useState<QueryOut[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState("")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [queryId, setQueryId] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setStatus("loading")
    setError("")
    try {
      const [boardRows, queryRows] = await Promise.all([api.getBoards(), api.getQueries()])
      setBoards(boardRows)
      setQueries(queryRows)
      setStatus("ready")
    } catch (loadError) {
      setStatus("error")
      setError(loadError instanceof Error ? loadError.message : "검토 보드를 불러오지 못했습니다.")
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const queryLabels = useMemo(() => new Map(queries.map((query) => [
    query.query_id,
    query.item_name?.trim() || (query.hs_code ? `HS ${query.hs_code}` : `품목 #${query.query_id}`),
  ])), [queries])

  function closeCreate() {
    if (isSaving) return
    setIsCreateOpen(false)
    setTitle("")
    setDescription("")
    setQueryId("")
    setFormError("")
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim() || isSaving) return
    setIsSaving(true)
    setFormError("")
    try {
      const board = await api.createBoard({
        title: title.trim(),
        description: description.trim() || undefined,
        query_id: queryId ? Number(queryId) : undefined,
      })
      setIsCreateOpen(false)
      router.push(`/boards/${board.board_id}`)
    } catch (createError) {
      setFormError(createError instanceof Error ? createError.message : "새 보드를 만들지 못했습니다.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(board: BoardOut) {
    if (deletingId || !window.confirm(`'${board.title}' 보드와 모든 카드를 삭제할까요?`)) return
    setDeletingId(board.board_id)
    setError("")
    try {
      await api.deleteBoard(board.board_id)
      setBoards((current) => current.filter((row) => row.board_id !== board.board_id))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "보드를 삭제하지 못했습니다.")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 md:px-8">
        <Link href="/dashboard" className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></span><span className="font-semibold tracking-tight">SupplyGuard</span></Link>
        <Button type="button" onClick={() => setIsCreateOpen(true)} className="bg-blue-600 hover:bg-blue-700"><Plus className="mr-2 h-4 w-4" />새 보드</Button>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" />대시보드로 돌아가기</Link>
        <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><FolderKanban className="h-4 w-4" />조달 검토 워크스페이스</div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">내 검토 보드</h1><p className="mt-2 text-sm text-slate-500">추천 후보를 모아 검토 상태와 의사결정 메모를 관리합니다.</p></div>
          {status === "ready" && boards.length > 0 && <Badge className="w-fit border-blue-100 bg-blue-50 px-3 py-1.5 text-blue-700 hover:bg-blue-50">총 {boards.length}개</Badge>}
        </div>

        {error && status !== "error" && <div role="alert" className="mt-5 flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

        {status === "loading" ? (
          <Card className="mt-7 border-slate-200 shadow-sm"><CardContent className="flex min-h-72 flex-col items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /><p className="mt-4 text-sm font-medium">검토 보드를 불러오는 중입니다.</p></CardContent></Card>
        ) : status === "error" ? (
          <Card className="mt-7 border-rose-100 shadow-sm"><CardContent className="flex min-h-72 flex-col items-center justify-center text-center"><CircleAlert className="h-9 w-9 text-rose-500" /><p className="mt-4 font-semibold">검토 보드를 표시할 수 없습니다.</p><p className="mt-2 max-w-xl text-sm text-slate-500">{error}</p><Button type="button" onClick={() => void load()} className="mt-5 bg-blue-600 hover:bg-blue-700"><RefreshCw className="mr-2 h-4 w-4" />다시 시도</Button></CardContent></Card>
        ) : boards.length === 0 ? (
          <Card className="mt-7 border-dashed border-slate-300 bg-white shadow-sm"><CardContent className="flex min-h-80 flex-col items-center justify-center text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><FolderKanban className="h-6 w-6" /></span><p className="mt-5 font-semibold">아직 만든 검토 보드가 없습니다.</p><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">품목별 또는 프로젝트별 보드를 만들고 추천 국가와 공급사 후보를 정리해 보세요.</p><Button type="button" onClick={() => setIsCreateOpen(true)} className="mt-5 bg-blue-600 hover:bg-blue-700"><Plus className="mr-2 h-4 w-4" />첫 보드 만들기</Button></CardContent></Card>
        ) : (
          <section className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {boards.map((board) => (
              <Card key={board.board_id} className="group flex h-full flex-col border-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><FolderKanban className="h-5 w-5" /></span><Button type="button" variant="ghost" size="icon" disabled={deletingId !== null} onClick={() => void handleDelete(board)} aria-label={`${board.title} 보드 삭제`} className="h-8 w-8 text-slate-400 opacity-0 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100">{deletingId === board.board_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</Button></div><CardTitle className="pt-2 text-lg">{board.title}</CardTitle><CardDescription className="min-h-10 leading-5">{board.description?.trim() || "설명 없이 생성된 검토 보드입니다."}</CardDescription></CardHeader>
                <CardContent className="flex flex-1 flex-col"><div className="space-y-2 text-xs text-slate-500"><p className="flex items-center gap-2"><PackageSearch className="h-3.5 w-3.5" />{board.query_id ? queryLabels.get(board.query_id) || `연결 품목 #${board.query_id}` : "연결된 품목 없음"}</p><p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" />{formatDate(board.updated_at || board.created_at)}</p></div><Button asChild variant="outline" className="mt-6 w-full border-slate-200 group-hover:border-blue-200 group-hover:text-blue-700"><Link href={`/boards/${board.board_id}`}>보드 열기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent>
              </Card>
            ))}
          </section>
        )}
      </main>

      {isCreateOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreate() }}>
          <Card role="dialog" aria-modal="true" aria-labelledby="create-board-title" className="w-full max-w-lg border-slate-200 shadow-2xl">
            <CardHeader className="flex flex-row items-start justify-between space-y-0"><div><CardTitle id="create-board-title">새 검토 보드</CardTitle><CardDescription className="mt-1.5">조달 의사결정을 정리할 작업 공간을 만듭니다.</CardDescription></div><Button type="button" variant="ghost" size="icon" onClick={closeCreate} disabled={isSaving} aria-label="새 보드 창 닫기" className="h-8 w-8"><X className="h-4 w-4" /></Button></CardHeader>
            <CardContent><form onSubmit={handleCreate} className="space-y-5"><div className="space-y-2"><Label htmlFor="board-title">보드 이름 *</Label><Input id="board-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder="예: 배터리 원자재 조달 검토" autoFocus required /></div><div className="space-y-2"><Label htmlFor="board-description">설명</Label><Textarea id="board-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} placeholder="검토 목적과 기준을 입력하세요." className="min-h-24" /></div><div className="space-y-2"><Label htmlFor="board-query">연결 품목</Label><select id="board-query" value={queryId} onChange={(event) => setQueryId(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="">연결하지 않음</option>{queries.map((query) => <option key={query.query_id} value={query.query_id}>{queryLabels.get(query.query_id)}{query.hs_code ? ` · HS ${query.hs_code}` : ""}</option>)}</select><p className="text-xs text-slate-500">품목을 연결하면 해당 추천 국가와 공급사를 카드로 바로 추가할 수 있습니다.</p></div>{formError && <p role="alert" className="flex items-start gap-2 text-sm text-rose-600"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{formError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={closeCreate} disabled={isSaving}>취소</Button><Button type="submit" disabled={!title.trim() || isSaving} className="bg-blue-600 hover:bg-blue-700">{isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />만드는 중</> : "보드 만들기"}</Button></div></form></CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
