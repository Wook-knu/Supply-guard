"use client"

// 공통 뒤로가기 — 브라우저 히스토리상 '바로 전 페이지'로 이동한다.
// 히스토리가 없을 때(직접 진입)만 대시보드로 폴백.

import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

export default function BackLink({ label = "뒤로", className = "" }: { label?: string; className?: string }) {
  const router = useRouter()
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back()
    else router.push("/dashboard")
  }
  return (
    <button type="button" onClick={goBack} className={`inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 ${className}`}>
      <ArrowLeft className="h-4 w-4" /> {label}
    </button>
  )
}
