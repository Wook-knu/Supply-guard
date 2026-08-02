"use client"

// 헤더 공용 사용자 아바타 — 로그인한 사용자의 프로필 이미지/이니셜을 표시한다.
// 모든 화면에서 동일하게 동작하도록 단일 컴포넌트로 재사용한다.

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

function initialsOf(name: string, email: string) {
  const source = name.trim() || email.trim()
  if (!source) return "SG"
  return source.slice(0, 2).toUpperCase()
}

export function UserAvatar() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [picture, setPicture] = useState("")

  useEffect(() => {
    let active = true
    api.getMe()
      .then((user) => {
        if (!active) return
        setName(user.name ?? "")
        setEmail(user.email ?? "")
        setPicture(user.picture_url ?? "")
      })
      .catch(() => {
        if (!active) return
        setName(""); setEmail(""); setPicture("")
      })
    return () => { active = false }
  }, [])

  const label = name || email || "사용자"

  return (
    <Avatar className="h-8 w-8 border border-slate-200">
      {picture && <AvatarImage src={picture} alt={`${label} 프로필`} />}
      <AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">{initialsOf(name, email)}</AvatarFallback>
    </Avatar>
  )
}
