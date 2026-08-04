"use client"

// 헤더 알림 벨 — 모든 내부 페이지가 공유한다.
//
// 이전에는 페이지마다 마크업을 복사해 써서 두 가지가 어긋나 있었다.
//   ① 8개 페이지에서 asChild+Link가 빠져 눌러도 알림센터로 가지 않았다.
//   ② 빨간 점이 조건 없이 렌더링돼, 모두 읽음 처리를 해도 사라지지 않았다.
// 링크와 미읽음 표시를 이 한곳에서만 관리해 다시 어긋나지 않게 한다.

import Link from "next/link"
import { useEffect, useState } from "react"
import { Bell } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"

// 알림을 읽은 쪽에서 이 이벤트를 쏘면 헤더 벨이 미읽음 수를 다시 읽는다.
// (벨과 알림 목록은 서로 다른 컴포넌트라 상태를 직접 공유할 수 없다)
export const ALERTS_UPDATED = "supplyguard:alerts-updated"
export function notifyAlertsUpdated() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ALERTS_UPDATED))
}

export default function AlertBell({ active = false }: { active?: boolean }) {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let isActive = true
    // 서버가 unread_only를 처리하지만, 응답에 읽은 건이 섞여 와도 안전하도록 한 번 더 걸러낸다.
    const load = () => api.getAlerts(true)
      .then((rows) => { if (isActive) setUnread(rows.filter((row) => !row.is_read).length) })
      .catch(() => { if (isActive) setUnread(0) })

    load()
    // 같은 화면에서 읽음 처리했을 때도 배지가 즉시 사라지게 한다.
    window.addEventListener(ALERTS_UPDATED, load)
    return () => { isActive = false; window.removeEventListener(ALERTS_UPDATED, load) }
  }, [])

  return (
    <Button asChild variant="ghost" size="icon" className={`relative ${active ? "text-blue-600" : "text-slate-600"}`}>
      <Link href="/alerts" aria-label={unread > 0 ? `알림 ${unread}건` : "알림 보기"}>
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
    </Button>
  )
}
