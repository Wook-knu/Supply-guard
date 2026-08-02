"use client"

// 헤더 공용 알림 벨 — 안읽은 알림이 있을 때만 빨간 점을 표시한다.
// 모든 화면에서 동일하게 동작하도록 단일 컴포넌트로 재사용한다.

import Link from "next/link"
import { useEffect, useState } from "react"
import { Bell } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"

export function AlertBell({ className = "text-slate-600" }: { className?: string }) {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let active = true
    api.getAlerts(true)
      .then((rows) => { if (active) setUnread(rows.length) })
      .catch(() => { if (active) setUnread(0) })
    return () => { active = false }
  }, [])

  return (
    <Button asChild variant="ghost" size="icon" className={`relative ${className}`}>
      <Link href="/alerts" aria-label={unread > 0 ? `알림 보기 (안읽음 ${unread}건)` : "알림 보기"}>
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />}
      </Link>
    </Button>
  )
}
