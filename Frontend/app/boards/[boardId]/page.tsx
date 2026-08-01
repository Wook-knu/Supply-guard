"use client"

// 추천 국가·기업과 자유 메모를 상태별로 관리하는 조달 검토 칸반 보드입니다.

import Link from "next/link"
import { DragEvent, FormEvent, use, useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Building2, CheckCircle2, CircleAlert, Edit3, FileText, FolderKanban, Globe2, GripVertical, Loader2, MoreHorizontal, Plus, RefreshCw, Save, ShieldAlert, Trash2, X } from "lucide-react"
import { api, type BoardDetailOut, type BoardItemKind, type BoardItemOut, type BoardStatus, type CountryReco, type QueryOut, type SupplierReco } from "@/lib/api"
import { getCountryName } from "@/lib/countries"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const COLUMNS: Array<{ key: BoardStatus; label: string; description: string; color: string; dot: string }> = [
  { key: "candidate", label: "후보", description: "새로 검토할 대상", color: "border-slate-200 bg-slate-100/70", dot: "bg-slate-400" },
  { key: "reviewing", label: "검토 중", description: "조건과 위험 확인", color: "border-blue-200 bg-blue-50/70", dot: "bg-blue-500" },
  { key: "selected", label: "선정", description: "최종 조달 후보", color: "border-emerald-200 bg-emerald-50/70", dot: "bg-emerald-500" },
  { key: "rejected", label: "제외", description: "검토 대상에서 제외", color: "border-rose-200 bg-rose-50/60", dot: "bg-rose-400" },
]

const KIND_META = {
  country: { label: "국가", icon: Globe2, className: "border-blue-100 bg-blue-50 text-blue-700" },
  company: { label: "기업", icon: Building2, className: "border-violet-100 bg-violet-50 text-violet-700" },
  note: { label: "메모", icon: FileText, className: "border-amber-100 bg-amber-50 text-amber-700" },
}

type RecommendationOption = { value: string; title: string; refCode: string; subtitle: string }

function normalizeStatus(status: BoardItemOut["status"]): BoardStatus {
  return COLUMNS.some((column) => column.key === status) ? status as BoardStatus : "candidate"
}

function sortItems(items: BoardItemOut[]) {
  return [...items].sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) || a.item_id - b.item_id)
}

export default function BoardDetailPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId: boardIdParam } = use(params)
  const boardId = Number(boardIdParam)
  const router = useRouter()
  const [board, setBoard] = useState<BoardDetailOut | null>(null)
  const [query, setQuery] = useState<QueryOut | null>(null)
  const [countryRecos, setCountryRecos] = useState<CountryReco[]>([])
  const [supplierRecos, setSupplierRecos] = useState<SupplierReco[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [dropTarget, setDropTarget] = useState<BoardStatus | null>(null)
  const [movingItemId, setMovingItemId] = useState<number | null>(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditBoardOpen, setIsEditBoardOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<BoardItemOut | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeletingBoard, setIsDeletingBoard] = useState(false)

  const load = useCallback(async () => {
    if (!Number.isInteger(boardId) || boardId <= 0) {
      setStatus("error")
      setError("올바르지 않은 보드 주소입니다.")
      return
    }
    setStatus("loading")
    setError("")
    try {
      const detail = await api.getBoard(boardId)
      setBoard(detail)
      setStatus("ready")
      if (detail.query_id) {
        try {
          const [queryRow, countries, suppliers] = await Promise.all([
            api.getQuery(detail.query_id),
            api.getCountryRecos(detail.query_id),
            api.getSupplierRecos(detail.query_id),
          ])
          setQuery(queryRow)
          setCountryRecos(countries)
          setSupplierRecos(suppliers)
        } catch {
          setQuery(null)
          setCountryRecos([])
          setSupplierRecos([])
          setError("보드는 불러왔지만 연결 품목의 추천 목록을 불러오지 못했습니다.")
        }
      } else {
        setQuery(null)
        setCountryRecos([])
        setSupplierRecos([])
      }
    } catch (loadError) {
      setStatus("error")
      setError(loadError instanceof Error ? loadError.message : "검토 보드를 불러오지 못했습니다.")
    }
  }, [boardId])

  useEffect(() => { void load() }, [load])

  const itemsByStatus = useMemo(() => {
    const grouped: Record<BoardStatus, BoardItemOut[]> = { candidate: [], reviewing: [], selected: [], rejected: [] }
    for (const item of sortItems(board?.items ?? [])) grouped[normalizeStatus(item.status)].push(item)
    return grouped
  }, [board?.items])

  const countryOptions: RecommendationOption[] = useMemo(() => countryRecos.map((row) => ({
    value: `country-${row.country_code}`,
    title: getCountryName(row.country_code),
    refCode: row.country_code,
    subtitle: `${row.rank}순위 · SGRI ${Math.round(Number(row.sgri_score ?? 0))} · 적합도 ${Math.round(Number(row.fit_score ?? 0))}`,
  })), [countryRecos])

  const supplierOptions: RecommendationOption[] = useMemo(() => supplierRecos.map((row) => ({
    value: `company-${row.company.company_id}`,
    title: row.company.name,
    refCode: String(row.company.company_id),
    subtitle: `${getCountryName(row.company.country_code ?? "") || "국가 정보 없음"} · 적합도 ${Math.round(Number(row.fit_score ?? 0))}`,
  })), [supplierRecos])

  async function moveItem(itemId: number, nextStatus: BoardStatus) {
    if (!board || movingItemId) return
    const current = board.items.find((item) => item.item_id === itemId)
    if (!current || normalizeStatus(current.status) === nextStatus) return
    const previousItems = board.items
    setMovingItemId(itemId)
    setError("")
    setMessage("")
    setBoard({ ...board, items: board.items.map((item) => item.item_id === itemId ? { ...item, status: nextStatus } : item) })
    try {
      const updated = await api.updateBoardItem(board.board_id, itemId, { status: nextStatus })
      setBoard((currentBoard) => currentBoard ? { ...currentBoard, items: currentBoard.items.map((item) => item.item_id === itemId ? updated : item) } : currentBoard)
      setMessage(`'${current.title}' 카드를 ${COLUMNS.find((column) => column.key === nextStatus)?.label}로 이동했습니다.`)
    } catch (moveError) {
      setBoard((currentBoard) => currentBoard ? { ...currentBoard, items: previousItems } : currentBoard)
      setError(moveError instanceof Error ? moveError.message : "카드 상태를 변경하지 못했습니다.")
    } finally {
      setMovingItemId(null)
      setDropTarget(null)
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, nextStatus: BoardStatus) {
    event.preventDefault()
    const itemId = Number(event.dataTransfer.getData("text/plain"))
    if (Number.isInteger(itemId) && itemId > 0) void moveItem(itemId, nextStatus)
  }

  async function deleteBoard() {
    if (!board || isDeletingBoard || !window.confirm(`'${board.title}' 보드와 모든 카드를 삭제할까요?`)) return
    setIsDeletingBoard(true)
    setError("")
    try {
      await api.deleteBoard(board.board_id)
      router.push("/boards")
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "보드를 삭제하지 못했습니다.")
      setIsDeletingBoard(false)
    }
  }

  if (status === "loading") return <PageShell><Card className="border-slate-200 shadow-sm"><CardContent className="flex min-h-[60vh] flex-col items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /><p className="mt-4 text-sm font-medium">검토 보드를 불러오는 중입니다.</p></CardContent></Card></PageShell>
  if (status === "error" || !board) return <PageShell><Card className="border-rose-100 shadow-sm"><CardContent className="flex min-h-[60vh] flex-col items-center justify-center text-center"><CircleAlert className="h-9 w-9 text-rose-500" /><p className="mt-4 font-semibold">검토 보드를 표시할 수 없습니다.</p><p className="mt-2 max-w-xl text-sm text-slate-500">{error}</p><div className="mt-5 flex gap-2"><Button asChild variant="outline"><Link href="/boards">보드 목록</Link></Button><Button type="button" onClick={() => void load()} className="bg-blue-600 hover:bg-blue-700"><RefreshCw className="mr-2 h-4 w-4" />다시 시도</Button></div></CardContent></Card></PageShell>

  return (
    <PageShell>
      <Link href="/boards" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" />검토 보드 목록</Link>
      <section className="mt-5 flex flex-col justify-between gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-start md:p-6">
        <div className="flex min-w-0 gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><FolderKanban className="h-5 w-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{board.title}</h1>{query && <Badge className="border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-50">{query.item_name?.trim() || `HS ${query.hs_code ?? "미지정"}`}</Badge>}</div><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{board.description?.trim() || "등록된 보드 설명이 없습니다."}</p><p className="mt-3 text-xs text-slate-400">카드를 다른 컬럼으로 드래그하거나 클릭해 상태와 메모를 편집하세요.</p></div></div>
        <div className="flex shrink-0 flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setIsEditBoardOpen(true)} className="border-slate-200"><Edit3 className="mr-2 h-4 w-4" />보드 편집</Button><Button type="button" data-testid="board-add-card" onClick={() => setIsAddOpen(true)} className="bg-blue-600 hover:bg-blue-700"><Plus className="mr-2 h-4 w-4" />카드 추가</Button><Button type="button" variant="ghost" size="icon" onClick={() => void deleteBoard()} disabled={isDeletingBoard} aria-label="보드 삭제" className="text-slate-400 hover:bg-rose-50 hover:text-rose-600">{isDeletingBoard ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</Button></div>
      </section>

      {message && <div role="status" className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />{message}</div>}
      {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      <section className="mt-6 grid min-w-0 gap-4 xl:grid-cols-4">
        {COLUMNS.map((column) => (
          <div key={column.key} data-board-column={column.key} onDragOver={(event) => { event.preventDefault(); setDropTarget(column.key) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null) }} onDrop={(event) => handleDrop(event, column.key)} className={`min-h-[440px] rounded-2xl border p-3 transition ${column.color} ${dropTarget === column.key ? "ring-2 ring-blue-400 ring-offset-2" : ""}`}>
            <div className="flex items-start justify-between px-1 py-1"><div><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${column.dot}`} /><h2 className="text-sm font-semibold">{column.label}</h2><Badge className="border-white bg-white/80 text-slate-600 hover:bg-white/80">{itemsByStatus[column.key].length}</Badge></div><p className="mt-1.5 text-xs text-slate-500">{column.description}</p></div><MoreHorizontal className="h-4 w-4 text-slate-400" /></div>
            <div className="mt-3 space-y-3">
              {itemsByStatus[column.key].map((item) => {
                const meta = KIND_META[item.kind] ?? KIND_META.note
                const Icon = meta.icon
                return <button key={item.item_id} data-board-item-id={item.item_id} type="button" draggable onDragStart={(event) => { event.dataTransfer.setData("text/plain", String(item.item_id)); event.dataTransfer.effectAllowed = "move" }} onDragEnd={() => setDropTarget(null)} onClick={() => { if (!movingItemId) setEditingItem(item) }} disabled={movingItemId === item.item_id} className="group w-full cursor-grab rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow active:cursor-grabbing disabled:opacity-60"><div className="flex items-start justify-between gap-3"><Badge className={`${meta.className} hover:${meta.className}`}><Icon className="mr-1 h-3 w-3" />{meta.label}</Badge><GripVertical className="h-4 w-4 text-slate-300 group-hover:text-slate-500" /></div><p className="mt-3 font-medium leading-5 text-slate-800">{item.title}</p>{item.ref_code && <p className="mt-1 text-[11px] font-medium text-slate-400">{item.kind === "country" ? "국가 코드" : "기업 ID"} · {item.ref_code}</p>}{item.memo?.trim() && <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-500">{item.memo}</p>}</button>
              })}
              {itemsByStatus[column.key].length === 0 && <button type="button" onClick={() => setIsAddOpen(true)} className="flex min-h-28 w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/50 text-xs text-slate-400 hover:border-blue-300 hover:bg-white hover:text-blue-600"><Plus className="mb-2 h-4 w-4" />카드 추가</button>}
            </div>
          </div>
        ))}
      </section>

      {isAddOpen && <AddItemDialog board={board} countryOptions={countryOptions} supplierOptions={supplierOptions} onClose={() => { if (!isSaving) setIsAddOpen(false) }} isSaving={isSaving} setIsSaving={setIsSaving} onSaved={(item) => { setBoard((current) => current ? { ...current, items: [...current.items, item] } : current); setIsAddOpen(false); setMessage(`'${item.title}' 카드를 추가했습니다.`); setError("") }} onError={setError} />}
      {isEditBoardOpen && <EditBoardDialog board={board} isSaving={isSaving} setIsSaving={setIsSaving} onClose={() => { if (!isSaving) setIsEditBoardOpen(false) }} onSaved={(updated) => { setBoard((current) => current ? { ...current, ...updated } : current); setIsEditBoardOpen(false); setMessage("보드 정보를 저장했습니다."); setError("") }} onError={setError} />}
      {editingItem && <EditItemDialog boardId={board.board_id} item={editingItem} isSaving={isSaving} setIsSaving={setIsSaving} onClose={() => { if (!isSaving) setEditingItem(null) }} onSaved={(updated) => { setBoard((current) => current ? { ...current, items: current.items.map((item) => item.item_id === updated.item_id ? updated : item) } : current); setEditingItem(null); setMessage("카드를 저장했습니다."); setError("") }} onDeleted={(itemId) => { setBoard((current) => current ? { ...current, items: current.items.filter((item) => item.item_id !== itemId) } : current); setEditingItem(null); setMessage("카드를 삭제했습니다."); setError("") }} onError={setError} />}
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="flex h-16 items-center border-b border-slate-200 bg-white px-5 md:px-8"><Link href="/dashboard" className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></span><span className="font-semibold tracking-tight">SupplyGuard</span></Link></header><main className="mx-auto max-w-[1600px] px-4 py-7 md:px-8">{children}</main></div>
}

function DialogFrame({ title, description, onClose, disabled, children }: { title: string; description: string; onClose: () => void; disabled: boolean; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><Card role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-lg overflow-y-auto border-slate-200 shadow-2xl"><CardHeader className="flex flex-row items-start justify-between space-y-0"><div><CardTitle>{title}</CardTitle><CardDescription className="mt-1.5">{description}</CardDescription></div><Button type="button" variant="ghost" size="icon" onClick={onClose} disabled={disabled} aria-label={`${title} 닫기`} className="h-8 w-8"><X className="h-4 w-4" /></Button></CardHeader><CardContent>{children}</CardContent></Card></div>
}

function AddItemDialog({ board, countryOptions, supplierOptions, onClose, isSaving, setIsSaving, onSaved, onError }: { board: BoardDetailOut; countryOptions: RecommendationOption[]; supplierOptions: RecommendationOption[]; onClose: () => void; isSaving: boolean; setIsSaving: (value: boolean) => void; onSaved: (item: BoardItemOut) => void; onError: (message: string) => void }) {
  const [kind, setKind] = useState<BoardItemKind>(countryOptions.length ? "country" : supplierOptions.length ? "company" : "note")
  const [selection, setSelection] = useState("")
  const [title, setTitle] = useState("")
  const [memo, setMemo] = useState("")
  const [itemStatus, setItemStatus] = useState<BoardStatus>("candidate")
  const [formError, setFormError] = useState("")
  const options = kind === "country" ? countryOptions : kind === "company" ? supplierOptions : []

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selected = options.find((option) => option.value === selection)
    const finalTitle = kind === "note" ? title.trim() : selected?.title
    if (!finalTitle || (kind !== "note" && !selected)) { setFormError(kind === "note" ? "메모 제목을 입력해 주세요." : "추가할 추천 대상을 선택해 주세요."); return }
    setIsSaving(true)
    setFormError("")
    try {
      const item = await api.addBoardItem(board.board_id, { kind, title: finalTitle, ref_code: selected?.refCode, memo: memo.trim() || undefined, status: itemStatus })
      onSaved(item)
    } catch (saveError) {
      const text = saveError instanceof Error ? saveError.message : "카드를 추가하지 못했습니다."
      setFormError(text)
      onError(text)
    } finally { setIsSaving(false) }
  }

  return <DialogFrame title="카드 추가" description="추천 국가·기업을 담거나 자유 메모를 추가합니다." onClose={onClose} disabled={isSaving}><form onSubmit={submit} className="space-y-5"><div className="grid grid-cols-3 gap-2">{(["country", "company", "note"] as BoardItemKind[]).map((value) => { const meta = KIND_META[value]; const Icon = meta.icon; const unavailable = value === "country" ? countryOptions.length === 0 : value === "company" ? supplierOptions.length === 0 : false; return <button key={value} type="button" onClick={() => { setKind(value); setSelection(""); setFormError("") }} disabled={unavailable} className={`rounded-lg border px-3 py-3 text-xs font-medium transition ${kind === value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"} disabled:cursor-not-allowed disabled:opacity-40`}><Icon className="mx-auto mb-1.5 h-4 w-4" />{meta.label}</button> })}</div>{kind === "note" ? <div className="space-y-2"><Label htmlFor="new-item-title">메모 제목 *</Label><Input id="new-item-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder="예: 계약 조건 추가 확인" autoFocus /></div> : <div className="space-y-2"><Label htmlFor="recommendation-selection">추천 {KIND_META[kind].label} *</Label><select id="recommendation-selection" value={selection} onChange={(event) => setSelection(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="">추가할 대상을 선택하세요</option>{options.map((option) => <option key={option.value} value={option.value}>{option.title} · {option.subtitle}</option>)}</select>{!board.query_id && <p className="text-xs text-amber-600">연결 품목이 없어 추천 목록을 불러올 수 없습니다.</p>}</div>}<div className="space-y-2"><Label htmlFor="new-item-status">초기 상태</Label><select id="new-item-status" value={itemStatus} onChange={(event) => setItemStatus(event.target.value as BoardStatus)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">{COLUMNS.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select></div><div className="space-y-2"><Label htmlFor="new-item-memo">검토 메모</Label><Textarea id="new-item-memo" value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={3000} placeholder="확인할 조건이나 선정 근거를 입력하세요." className="min-h-28" /></div>{formError && <p role="alert" className="flex items-start gap-2 text-sm text-rose-600"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{formError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>취소</Button><Button type="submit" disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">{isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />추가 중</> : <><Plus className="mr-2 h-4 w-4" />카드 추가</>}</Button></div></form></DialogFrame>
}

function EditBoardDialog({ board, isSaving, setIsSaving, onClose, onSaved, onError }: { board: BoardDetailOut; isSaving: boolean; setIsSaving: (value: boolean) => void; onClose: () => void; onSaved: (board: BoardDetailOut) => void; onError: (message: string) => void }) {
  const [title, setTitle] = useState(board.title)
  const [description, setDescription] = useState(board.description ?? "")
  const [formError, setFormError] = useState("")
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!title.trim()) return; setIsSaving(true); setFormError(""); try { const updated = await api.updateBoard(board.board_id, { title: title.trim(), description: description.trim() }); onSaved({ ...board, ...updated }) } catch (saveError) { const text = saveError instanceof Error ? saveError.message : "보드를 저장하지 못했습니다."; setFormError(text); onError(text) } finally { setIsSaving(false) } }
  return <DialogFrame title="보드 편집" description="보드 이름과 검토 목적을 수정합니다." onClose={onClose} disabled={isSaving}><form onSubmit={submit} className="space-y-5"><div className="space-y-2"><Label htmlFor="edit-board-title">보드 이름 *</Label><Input id="edit-board-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required autoFocus /></div><div className="space-y-2"><Label htmlFor="edit-board-description">설명</Label><Textarea id="edit-board-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} className="min-h-28" /></div>{formError && <p role="alert" className="text-sm text-rose-600">{formError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>취소</Button><Button type="submit" disabled={!title.trim() || isSaving} className="bg-blue-600 hover:bg-blue-700">{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}저장</Button></div></form></DialogFrame>
}

function EditItemDialog({ boardId, item, isSaving, setIsSaving, onClose, onSaved, onDeleted, onError }: { boardId: number; item: BoardItemOut; isSaving: boolean; setIsSaving: (value: boolean) => void; onClose: () => void; onSaved: (item: BoardItemOut) => void; onDeleted: (itemId: number) => void; onError: (message: string) => void }) {
  const [title, setTitle] = useState(item.title)
  const [memo, setMemo] = useState(item.memo ?? "")
  const [itemStatus, setItemStatus] = useState<BoardStatus>(normalizeStatus(item.status))
  const [formError, setFormError] = useState("")
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!title.trim()) return; setIsSaving(true); setFormError(""); try { onSaved(await api.updateBoardItem(boardId, item.item_id, { title: title.trim(), memo: memo.trim(), status: itemStatus })) } catch (saveError) { const text = saveError instanceof Error ? saveError.message : "카드를 저장하지 못했습니다."; setFormError(text); onError(text) } finally { setIsSaving(false) } }
  async function remove() { if (isSaving || !window.confirm(`'${item.title}' 카드를 삭제할까요?`)) return; setIsSaving(true); setFormError(""); try { await api.deleteBoardItem(boardId, item.item_id); onDeleted(item.item_id) } catch (deleteError) { const text = deleteError instanceof Error ? deleteError.message : "카드를 삭제하지 못했습니다."; setFormError(text); onError(text) } finally { setIsSaving(false) } }
  return <DialogFrame title="카드 편집" description="상태와 검토 메모를 저장합니다." onClose={onClose} disabled={isSaving}><form onSubmit={submit} className="space-y-5"><div className="space-y-2"><Label htmlFor="edit-item-title">카드 제목 *</Label><Input id="edit-item-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required autoFocus /></div><div className="space-y-2"><Label htmlFor="edit-item-status">검토 상태</Label><select id="edit-item-status" value={itemStatus} onChange={(event) => setItemStatus(event.target.value as BoardStatus)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">{COLUMNS.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select></div><div className="space-y-2"><Label htmlFor="edit-item-memo">검토 메모</Label><Textarea id="edit-item-memo" value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={3000} placeholder="선정 근거, 확인 사항, 협의 내용을 입력하세요." className="min-h-32" /></div>{formError && <p role="alert" className="text-sm text-rose-600">{formError}</p>}<div className="flex justify-between gap-2"><Button type="button" variant="ghost" onClick={() => void remove()} disabled={isSaving} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="mr-2 h-4 w-4" />삭제</Button><div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>취소</Button><Button type="submit" disabled={!title.trim() || isSaving} className="bg-blue-600 hover:bg-blue-700">{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}저장</Button></div></div></form></DialogFrame>
}
