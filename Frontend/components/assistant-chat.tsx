"use client"

// 모든 화면에서 유지되는 공급망 데이터 기반 AI 챗 위젯입니다.

import { FormEvent, useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { Bot, CircleAlert, Loader2, MessageCircle, RotateCcw, Send, Sparkles, X } from "lucide-react"
import { api, type ChatHistoryMessage, type ChatResponse } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type UiMessage = ChatHistoryMessage & {
  id: number
  source?: ChatResponse["source"]
  followups?: string[]
}

const STARTER_QUESTIONS = [
  "내 품목 중 가장 위험한 것은 무엇인가요?",
  "대체 공급국을 추천해 주세요.",
  "최근 확인해야 할 알림을 알려주세요.",
]

export function AssistantChat() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [draft, setDraft] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState("")
  const [queryId, setQueryId] = useState<number | null>(null)
  const [contextLabel, setContextLabel] = useState("")
  const nextMessageId = useRef(1)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // URL의 query_id를 우선 사용하고, 리스크·보고서 상세는 API로 해당 품목을 찾습니다.
  useEffect(() => {
    if (!isOpen) return
    let isActive = true

    async function resolveContext() {
      setQueryId(null)
      setContextLabel("")

      const directQueryId = Number(searchParams.get("query_id"))
      if (Number.isInteger(directQueryId) && directQueryId > 0) {
        setQueryId(directQueryId)
        try {
          const query = await api.getQuery(directQueryId)
          if (isActive) setContextLabel(query.item_name?.trim() || `HS ${query.hs_code ?? "미지정"}`)
        } catch {
          if (isActive) setContextLabel(`품목 #${directQueryId}`)
        }
        return
      }

      const riskMatch = pathname.match(/^\/risks\/([^/]+)$/)
      if (riskMatch) {
        const hsCode = decodeURIComponent(riskMatch[1])
        try {
          const queries = await api.getQueries()
          const query = queries.find((row) => row.hs_code === hsCode)
          if (isActive && query) {
            setQueryId(query.query_id)
            setContextLabel(query.item_name?.trim() || `HS ${hsCode}`)
          }
        } catch {
          // 비로그인 또는 조회 실패 시 전체 공개 데이터 기반 답변으로 동작한다.
        }
        return
      }

      const reportMatch = pathname.match(/^\/reports\/(\d+)$/)
      if (reportMatch) {
        try {
          const report = await api.getReport(Number(reportMatch[1]))
          if (!report.query_id) return
          const query = await api.getQuery(report.query_id)
          if (isActive) {
            setQueryId(query.query_id)
            setContextLabel(query.item_name?.trim() || `HS ${query.hs_code ?? "미지정"}`)
          }
        } catch {
          // 보고서 맥락을 찾지 못해도 일반 챗봇은 계속 사용할 수 있다.
        }
        return
      }

      const boardMatch = pathname.match(/^\/boards\/(\d+)$/)
      if (boardMatch) {
        try {
          const board = await api.getBoard(Number(boardMatch[1]))
          if (!board.query_id) return
          const query = await api.getQuery(board.query_id)
          if (isActive) {
            setQueryId(query.query_id)
            setContextLabel(query.item_name?.trim() || `HS ${query.hs_code ?? "미지정"}`)
          }
        } catch {
          // 보드의 품목 맥락을 찾지 못해도 일반 챗봇은 계속 사용할 수 있다.
        }
      }
    }

    void resolveContext()
    return () => { isActive = false }
  }, [isOpen, pathname, searchParams])

  useEffect(() => {
    if (!isOpen) return
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [isOpen, isSending, messages])

  async function sendMessage(value: string) {
    const question = value.trim()
    if (!question || isSending) return

    const history = messages
      .slice(-6)
      .map(({ role, content }) => ({ role, content }))
    const userMessage: UiMessage = { id: nextMessageId.current++, role: "user", content: question }

    setMessages((current) => [...current.slice(-19), userMessage])
    setDraft("")
    setError("")
    setIsSending(true)

    try {
      const response = await api.chat({
        message: question,
        query_id: queryId ?? undefined,
        history: history.length ? history : undefined,
      })
      const assistantMessage: UiMessage = {
        id: nextMessageId.current++,
        role: "assistant",
        content: response.answer,
        source: response.source,
        followups: response.followups ?? [],
      }
      setMessages((current) => [...current.slice(-19), assistantMessage])
    } catch (requestError) {
      setDraft(question)
      setError(requestError instanceof Error ? requestError.message : "답변을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setIsSending(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendMessage(draft)
  }

  function clearConversation() {
    setMessages([])
    setDraft("")
    setError("")
  }

  if (pathname === "/" || pathname === "/login") return null

  return (
    <>
      {isOpen && (
        <section role="dialog" aria-label="SupplyGuard AI 어시스턴트" className="no-print fixed bottom-24 left-4 right-4 z-50 flex h-[min(620px,calc(100vh-7rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:left-auto sm:right-6 sm:w-[390px]">
          <header className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15"><Bot className="h-5 w-5" /></span>
              <div className="min-w-0"><p className="text-sm font-semibold">SupplyGuard AI</p><p className="truncate text-xs text-blue-100">내 공급망 데이터를 근거로 답변합니다.</p></div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && <Button type="button" variant="ghost" size="icon" onClick={clearConversation} aria-label="대화 초기화" className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"><RotateCcw className="h-4 w-4" /></Button>}
              <Button type="button" variant="ghost" size="icon" onClick={() => setIsOpen(false)} aria-label="AI 어시스턴트 닫기" className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"><X className="h-4 w-4" /></Button>
            </div>
          </header>

          {queryId && <div className="border-b border-blue-100 bg-blue-50 px-4 py-2"><Badge className="max-w-full border-blue-100 bg-white text-blue-700 hover:bg-white"><Sparkles className="mr-1 h-3 w-3" /><span className="truncate">현재 품목 · {contextLabel || `#${queryId}`}</span></Badge></div>}

          <div className="flex-1 overflow-y-auto bg-slate-50/70 p-4" aria-live="polite">
            {messages.length === 0 ? (
              <div className="flex min-h-full flex-col justify-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-600"><MessageCircle className="h-5 w-5" /></div>
                <p className="mt-4 text-center text-sm font-semibold text-slate-800">공급망에 관해 무엇이든 물어보세요.</p>
                <p className="mt-1 text-center text-xs leading-5 text-slate-500">등록한 품목, SGRI, 추천 국가와 최근 알림을 바탕으로 답합니다.</p>
                <div className="mt-5 space-y-2">{STARTER_QUESTIONS.map((question) => <button type="button" key={question} onClick={() => void sendMessage(question)} disabled={isSending} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-xs leading-5 text-slate-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50">{question}</button>)}</div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div className={message.role === "user" ? "max-w-[85%] rounded-2xl rounded-br-md bg-blue-600 px-3.5 py-2.5 text-sm leading-6 text-white" : "max-w-[92%]"}>
                      {message.role === "assistant" ? (
                        <div>
                          <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3 text-sm leading-6 text-slate-700 shadow-sm">
                            <p className="whitespace-pre-wrap">{message.content}</p>
                            {message.source && <p className="mt-2 text-[10px] font-medium text-slate-400">{message.source === "gemini" ? "Gemini AI 답변" : "데이터 기반 기본 답변"}</p>}
                          </div>
                          {message.followups && message.followups.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{message.followups.map((followup) => <button type="button" key={followup} onClick={() => void sendMessage(followup)} disabled={isSending} className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-left text-[11px] leading-4 text-blue-700 hover:bg-blue-100 disabled:opacity-50">{followup}</button>)}</div>}
                        </div>
                      ) : message.content}
                    </div>
                  </div>
                ))}
                {isSending && <div className="flex justify-start"><div role="status" className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3 text-xs text-slate-500 shadow-sm"><Loader2 className="h-4 w-4 animate-spin text-blue-600" />데이터를 확인하고 있습니다.</div></div>}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && <div role="alert" className="flex items-start gap-2 border-t border-rose-100 bg-rose-50 px-4 py-2.5 text-xs leading-5 text-rose-700"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</div>}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-200 bg-white p-3">
            <Input aria-label="AI 어시스턴트에게 질문" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="공급망 질문을 입력하세요" disabled={isSending} className="h-10 flex-1 border-slate-200" />
            <Button type="submit" size="icon" disabled={!draft.trim() || isSending} aria-label="질문 전송" className="h-10 w-10 shrink-0 bg-blue-600 hover:bg-blue-700">{isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
          </form>
        </section>
      )}

      <Button type="button" onClick={() => setIsOpen((current) => !current)} aria-label={isOpen ? "AI 어시스턴트 닫기" : "AI 어시스턴트 열기"} className="no-print fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 p-0 text-white shadow-lg hover:from-blue-700 hover:to-cyan-600 sm:bottom-6 sm:right-6">{isOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}</Button>
    </>
  )
}
