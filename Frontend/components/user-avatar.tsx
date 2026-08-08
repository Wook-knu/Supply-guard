"use client"

// 헤더 사용자 아바타 — 모든 내부 페이지가 공유한다.
//
// 이전에는 페이지마다 이니셜을 직접 써넣어(대부분 "SW", 내 품목만 "SG")
// 로그인한 사람이 누구든 같은 글자가 보였다. 프로필 사진도 반영되지 않았다.
// 표시 규칙을 이 한곳에서만 관리해 다시 어긋나지 않게 한다.

import Link from "next/link"
import { useEffect, useState } from "react"
import { User } from "lucide-react"
import { api, type UserOut } from "@/lib/api"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

// 프로필을 저장한 쪽에서 이 이벤트를 쏘면 헤더 아바타가 다시 조회한다.
export const PROFILE_UPDATED = "supplyguard:profile-updated"
export function notifyProfileUpdated() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROFILE_UPDATED))
}

// 표시용 이니셜: 한글 이름은 앞 두 글자(전상욱 → 전상),
// 영문 이름은 성·이름 첫 글자(Jane Doe → JD), 이름이 없으면 이메일 앞 두 글자.
export function initialsOf(user: { name?: string | null; email?: string | null } | null | undefined): string {
  const name = user?.name?.trim()
  if (name) {
    if (/[가-힣]/.test(name)) return name.slice(0, 2)
    const words = name.split(/\s+/).filter(Boolean)
    return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase()
  }
  const email = user?.email?.trim()
  if (email) return email.slice(0, 2).toUpperCase()
  return ""
}

export default function UserAvatar({
  className = "h-8 w-8",
  textClassName = "text-xs",
}: { className?: string; textClassName?: string }) {
  const [user, setUser] = useState<UserOut | null>(null)

  useEffect(() => {
    let isActive = true
    const load = () => api.getMe()
      .then((u) => { if (isActive) setUser(u) })
      .catch(() => { if (isActive) setUser(null) })

    load()
    window.addEventListener(PROFILE_UPDATED, load)
    return () => { isActive = false; window.removeEventListener(PROFILE_UPDATED, load) }
  }, [])

  const initials = initialsOf(user)

  // 클릭하면 프로필 수정(설정) 페이지로 이동. 호버 시 파란 링으로 클릭 가능함을 표시.
  return (
    <Link href="/settings" aria-label="프로필 설정" title="프로필 설정"
      className="rounded-full ring-offset-2 transition hover:ring-2 hover:ring-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <Avatar className={`${className} border border-slate-200`}>
        {user?.picture_url && <AvatarImage src={user.picture_url} alt={user.name ?? "프로필"} />}
        <AvatarFallback className={`bg-blue-50 ${textClassName} font-semibold text-blue-700`}>
          {initials || <User className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>
    </Link>
  )
}
