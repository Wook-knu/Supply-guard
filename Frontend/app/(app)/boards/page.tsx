"use client"

// 검토 보드 (노션/칸반식) — 추천받은 국가·기업·메모를 카드로 담아 상태별로 정리한다.
// 백엔드: /boards (backend/app/api/v1/boards.py). 상태: 후보 → 검토중 → 선정 / 제외.

import Link from "next/link"
import { FormEvent, useEffect, useState } from "react"
import { api, type Board, type BoardCard, type BoardDetail } from "@/lib/api"
import { ArrowLeft, Bell, Building2, ClipboardList, Globe2, Loader2, Plus, ShieldAlert, StickyNote, Trash2, X } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const COLUMNS = [
  { key: "candidate", label: "후보", dot: "bg-slate-400", head: "text-slate-600" },
  { key: "reviewing", label: "검토중", dot: "bg-amber-500", head: "text-amber-700" },
  { key: "selected", label: "선정", dot: "bg-emerald-500", head: "text-emerald-700" },
  { key: "rejected", label: "제외", dot: "bg-rose-400", head: "text-rose-600" },
]

const KIND_META: Record<string, { icon: typeof Globe2; label: string; cls: string }> = {
  country: { icon: Globe2, label: "국가", cls: "bg-blue-50 text-blue-600" },
  company: { icon: Building2, label: "기업", cls: "bg-violet-50 text-violet-600" },
  note: { icon: StickyNote, label: "메모", cls: "bg-amber-50 text-amber-600" },
}

export default function BoardsPage() {
  const [boards, setBoards] = useState<Board[]>([])
  const [active, setActive] = useState<BoardDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newBoardTitle, setNewBoardTitle] = useState("")
  const [dragId, setDragId] = useState<number | null>(null)
  const [error, setError] = useState("")

  const loadBoards = () => {
    setLoading(true)
    api.getBoards()
      .then(async (rows) => {
        setBoards(rows)
        if (rows.length > 0) setActive(await api.getBoard(rows[0].board_id))
        setError("")
      })
      .catch(() => setError("보드를 불러오지 못했습니다. 로그인 상태를 확인해 주세요."))
      .finally(() => setLoading(false))
  }

  useEffect(loadBoards, [])

  const selectBoard = async (id: number) => {
    try { setActive(await api.getBoard(id)) } catch { setError("보드를 불러오지 못했습니다.") }
  }

  const createBoard = async (e: FormEvent) => {
    e.preventDefault()
    const title = newBoardTitle.trim()
    if (!title) return
    setCreating(true)
    try {
      const b = await api.createBoard({ title })
      setBoards((prev) => [b, ...prev])
      setActive(await api.getBoard(b.board_id))
      setNewBoardTitle("")
    } catch { setError("보드 생성에 실패했습니다.") } finally { setCreating(false) }
  }

  const removeBoard = async (id: number) => {
    if (!window.confirm("이 보드를 삭제할까요? 카드도 함께 삭제됩니다.")) return
    try {
      await api.deleteBoard(id)
      const rest = boards.filter((b) => b.board_id !== id)
      setBoards(rest)
      setActive(rest.length ? await api.getBoard(rest[0].board_id) : null)
    } catch { setError("보드 삭제에 실패했습니다.") }
  }

  const moveCard = async (card: BoardCard, status: string) => {
    if (!active || card.status === status) return
    // 낙관적 업데이트
    setActive({ ...active, items: active.items.map((i) => (i.item_id === card.item_id ? { ...i, status } : i)) })
    try { await api.updateBoardCard(active.board_id, card.item_id, { status }) }
    catch { selectBoard(active.board_id) }
  }

  const deleteCard = async (card: BoardCard) => {
    if (!active) return
    setActive({ ...active, items: active.items.filter((i) => i.item_id !== card.item_id) })
    try { await api.deleteBoardCard(active.board_id, card.item_id) }
    catch { selectBoard(active.board_id) }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link>
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="relative text-slate-600"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기</Link>
        <div className="mt-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><ClipboardList className="h-4 w-4" /> 검토 보드</div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">조달 후보를 정리하고 검토하세요</h1>
            <p className="mt-2 text-sm text-slate-500">추천받은 국가·기업을 카드로 담아 후보 → 검토중 → 선정/제외로 관리합니다. 카드를 끌어다 옮길 수 있어요.</p>
          </div>
        </div>

        {error && <div role="alert" className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        {/* 보드 선택 + 생성 */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {boards.map((b) => (
            <button key={b.board_id} onClick={() => selectBoard(b.board_id)}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${active?.board_id === b.board_id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {b.title}
              {active?.board_id === b.board_id && <span onClick={(e) => { e.stopPropagation(); removeBoard(b.board_id) }} className="text-slate-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></span>}
            </button>
          ))}
          <form onSubmit={createBoard} className="inline-flex items-center gap-1.5">
            <Input value={newBoardTitle} onChange={(e) => setNewBoardTitle(e.target.value)} placeholder="새 보드 이름" className="h-9 w-40" />
            <Button type="submit" size="sm" variant="outline" disabled={creating || !newBoardTitle.trim()} className="border-slate-200">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-4 w-4" />추가</>}</Button>
          </form>
        </div>

        {loading ? (
          <div className="flex justify-center py-24 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !active ? (
          <Card className="mt-8 border-dashed border-slate-300 bg-white/60"><CardContent className="flex flex-col items-center gap-2 py-16 text-center"><ClipboardList className="h-8 w-8 text-slate-300" /><p className="font-medium text-slate-600">아직 검토 보드가 없습니다.</p><p className="text-sm text-slate-400">위에서 새 보드를 만들어 후보 국가·기업을 정리해 보세요.</p></CardContent></Card>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((col) => {
              const cards = active.items.filter((i) => (i.status ?? "candidate") === col.key)
              return (
                <div key={col.key} onDragOver={(e) => e.preventDefault()} onDrop={() => { const c = active.items.find((i) => i.item_id === dragId); if (c) moveCard(c, col.key); setDragId(null) }}
                  className="flex flex-col rounded-xl border border-slate-200 bg-slate-100/50 p-3">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${col.dot}`} /><span className={`text-sm font-semibold ${col.head}`}>{col.label}</span></div>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">{cards.length}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    {cards.map((card) => {
                      const meta = KIND_META[card.kind] ?? KIND_META.note
                      const Icon = meta.icon
                      return (
                        <div key={card.item_id} draggable onDragStart={() => setDragId(card.item_id)} onDragEnd={() => setDragId(null)}
                          className="group cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow active:cursor-grabbing">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5"><span className={`flex h-5 w-5 items-center justify-center rounded ${meta.cls}`}><Icon className="h-3 w-3" /></span><span className="text-[11px] font-medium text-slate-400">{meta.label}{card.ref_code ? ` · ${card.ref_code}` : ""}</span></div>
                            <button onClick={() => deleteCard(card)} aria-label="카드 삭제" className="text-slate-300 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
                          </div>
                          <p className="mt-1.5 text-sm font-medium leading-snug text-slate-800">{card.title}</p>
                          {card.memo && <p className="mt-1 text-xs leading-relaxed text-slate-500">{card.memo}</p>}
                        </div>
                      )
                    })}
                    <AddCardForm onAdd={async (body) => { if (!active) return; const c = await api.addBoardCard(active.board_id, { ...body, status: col.key }); setActive((prev) => (prev ? { ...prev, items: [...prev.items, c] } : prev)) }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

function AddCardForm({ onAdd }: { onAdd: (body: { kind: string; title: string; memo?: string }) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [memo, setMemo] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try { await onAdd({ kind: "note", title: title.trim(), memo: memo.trim() || undefined }); setTitle(""); setMemo(""); setOpen(false) }
    finally { setBusy(false) }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-600"><Plus className="h-3.5 w-3.5" /> 카드 추가</button>
  )
  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
      <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="카드 제목" className="h-8 border-0 px-1 text-sm shadow-none focus-visible:ring-0" />
      <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택)" className="mt-1 min-h-14 resize-none border-0 px-1 text-xs shadow-none focus-visible:ring-0" />
      <div className="mt-1 flex items-center justify-end gap-1.5">
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setOpen(false)}>취소</Button>
        <Button type="submit" size="sm" disabled={busy || !title.trim()} className="h-7 bg-blue-600 px-2.5 text-xs hover:bg-blue-700">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "추가"}</Button>
      </div>
    </form>
  )
}
