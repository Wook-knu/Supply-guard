"use client"

// 전역 AI 챗봇 위젯 — 모든 내부 페이지 우하단에 떠 있는 대화 버튼/패널.
// 백엔드: POST /chat (사용자 SGRI·추천·알림 데이터 기반 답변)

import { useEffect, useRef, useState } from "react"
import { api, type ChatMessage } from "@/lib/api"
import { Loader2, MessageCircle, Send, Sparkles, X } from "lucide-react"

const GREETING: ChatMessage = {
  role: "assistant",
  content: "안녕하세요! SupplyGuard AI 어시스턴트예요. 등록한 품목의 공급망 위험, 대체 공급처, 지표 해석 등 무엇이든 물어보세요.",
}
const STARTER_QUESTIONS = ["내 품목 중 가장 위험한 게 뭐야?", "대체 공급국을 추천해줘", "SGRI 지표가 뭐야?"]

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING])
  const [followups, setFollowups] = useState<string[]>(STARTER_QUESTIONS)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 새 메시지가 오면 하단으로 스크롤
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, loading, open])

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || loading) return
    const history = messages.filter((m) => m !== GREETING)
    setMessages((prev) => [...prev, { role: "user", content: message }])
    setInput("")
    setFollowups([])
    setLoading(true)
    try {
      const res = await api.chat(message, { history })
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer }])
      setFollowups(res.followups ?? [])
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "죄송해요, 답변을 불러오지 못했어요. 로그인 상태를 확인하거나 잠시 후 다시 시도해 주세요." }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* 우하단 플로팅 버튼 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "AI 어시스턴트 닫기" : "AI 어시스턴트 열기"}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/30 transition-transform hover:scale-105 active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* 대화 패널 */}
      {open && (
        <div className="fixed bottom-24 right-5 z-40 flex h-[540px] w-[min(384px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* 헤더 */}
          <div className="flex items-center gap-2.5 border-b border-slate-100 bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-3 text-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20"><Sparkles className="h-4 w-4" /></div>
            <div>
              <p className="text-sm font-semibold leading-tight">AI 어시스턴트</p>
              <p className="text-[11px] text-white/80">공급망 리스크를 물어보세요</p>
            </div>
          </div>

          {/* 메시지 영역 */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm border border-slate-200 bg-white text-slate-700"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> 생각하는 중...
                </div>
              </div>
            )}

            {/* 추천/후속 질문 칩 */}
            {!loading && followups.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {followups.slice(0, 3).map((q) => (
                  <button key={q} type="button" onClick={() => send(q)} className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50">
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 입력 */}
          <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="flex items-center gap-2 border-t border-slate-100 bg-white p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="메시지를 입력하세요..."
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
            <button type="submit" disabled={!input.trim() || loading} aria-label="전송" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
