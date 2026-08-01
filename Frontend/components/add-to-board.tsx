"use client"

// 추천 국가·기업을 사용자가 선택한 검토 보드에 저장하는 공통 액션입니다.

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, CheckCircle2, CircleAlert, FolderKanban, Loader2, Plus, X } from "lucide-react"
import { api, type BoardItemKind, type BoardOut } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type AddToBoardProps = {
  kind: Exclude<BoardItemKind, "note">
  title: string
  refCode: string
  memo?: string
  queryId?: number | null
  className?: string
  label?: string
}

export function AddToBoard({ kind, title, refCode, memo, queryId, className = "", label = "검토 보드에 추가" }: AddToBoardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [boards, setBoards] = useState<BoardOut[]>([])
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [selectedBoardId, setSelectedBoardId] = useState("")
  const [error, setError] = useState("")
  const [addedBoard, setAddedBoard] = useState<BoardOut | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function open() {
    setIsOpen(true)
    setStatus("loading")
    setError("")
    setAddedBoard(null)
    try {
      const rows = await api.getBoards()
      setBoards(rows)
      const preferred = rows.find((board) => queryId && board.query_id === queryId) ?? rows[0]
      setSelectedBoardId(preferred ? String(preferred.board_id) : "")
      setStatus("ready")
    } catch (loadError) {
      setStatus("error")
      setError(loadError instanceof Error ? loadError.message : "검토 보드를 불러오지 못했습니다.")
    }
  }

  async function add() {
    const boardId = Number(selectedBoardId)
    if (!Number.isInteger(boardId) || boardId <= 0 || isSaving) return
    setIsSaving(true)
    setError("")
    try {
      await api.addBoardItem(boardId, { kind, title, ref_code: refCode, memo, status: "candidate" })
      setAddedBoard(boards.find((board) => board.board_id === boardId) ?? null)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "검토 보드에 추가하지 못했습니다.")
    } finally {
      setIsSaving(false)
    }
  }

  return <>
    <Button type="button" variant="outline" onClick={() => void open()} className={`border-slate-200 ${className}`}><FolderKanban className="mr-2 h-4 w-4" />{label}</Button>
    {isOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setIsOpen(false) }}><Card role="dialog" aria-modal="true" aria-label="검토 보드에 추가" className="w-full max-w-md border-slate-200 shadow-2xl"><CardHeader className="flex flex-row items-start justify-between space-y-0"><div><CardTitle className="text-lg">검토 보드에 추가</CardTitle><CardDescription className="mt-1.5">{title}을(를) 후보 카드로 저장합니다.</CardDescription></div><Button type="button" variant="ghost" size="icon" onClick={() => setIsOpen(false)} disabled={isSaving} aria-label="검토 보드 선택 닫기" className="h-8 w-8"><X className="h-4 w-4" /></Button></CardHeader><CardContent>
      {status === "loading" ? <div className="flex min-h-36 flex-col items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /><p className="mt-3 text-sm text-slate-500">내 검토 보드를 불러오는 중입니다.</p></div>
        : status === "error" ? <div className="py-5 text-center"><CircleAlert className="mx-auto h-7 w-7 text-rose-500" /><p className="mt-3 text-sm text-rose-600">{error}</p><Button type="button" variant="outline" onClick={() => void open()} className="mt-4">다시 시도</Button></div>
        : addedBoard ? <div className="py-4 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" /><p className="mt-3 font-semibold">후보 카드로 추가했습니다.</p><p className="mt-1 text-sm text-slate-500">{addedBoard.title}에서 검토를 이어갈 수 있습니다.</p><div className="mt-5 flex justify-center gap-2"><Button type="button" variant="outline" onClick={() => setIsOpen(false)}>닫기</Button><Button asChild className="bg-blue-600 hover:bg-blue-700"><Link href={`/boards/${addedBoard.board_id}`}>보드 열기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div></div>
        : boards.length === 0 ? <div className="py-5 text-center"><FolderKanban className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-3 font-semibold">먼저 검토 보드를 만들어 주세요.</p><p className="mt-1 text-sm text-slate-500">새 보드를 만든 뒤 추천 후보를 담을 수 있습니다.</p><Button asChild className="mt-5 bg-blue-600 hover:bg-blue-700"><Link href="/boards"><Plus className="mr-2 h-4 w-4" />새 보드 만들기</Link></Button></div>
        : <div className="space-y-4"><div className="space-y-2"><label htmlFor={`board-select-${kind}-${refCode}`} className="text-sm font-medium">추가할 보드</label><select id={`board-select-${kind}-${refCode}`} value={selectedBoardId} onChange={(event) => setSelectedBoardId(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">{boards.map((board) => <option key={board.board_id} value={board.board_id}>{board.title}{board.query_id === queryId ? " · 현재 품목" : ""}</option>)}</select></div>{error && <p role="alert" className="flex items-start gap-2 text-sm text-rose-600"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isSaving}>취소</Button><Button type="button" onClick={() => void add()} disabled={!selectedBoardId || isSaving} className="bg-blue-600 hover:bg-blue-700">{isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />추가 중</> : <><Plus className="mr-2 h-4 w-4" />후보로 추가</>}</Button></div></div>}
    </CardContent></Card></div>}
  </>
}
