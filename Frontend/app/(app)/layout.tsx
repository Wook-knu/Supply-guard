"use client"

// 인증 후 내부 페이지 공통 레이아웃 — 좌측 사이드바가 모든 페이지에서 유지된다.
// (login/page 등은 이 그룹 밖이라 사이드바 없음)

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CircleAlert, FileText, Globe2, Home, LayoutGrid, Settings, ShieldAlert, Sparkles } from "lucide-react"

const NAV = [
  { href: "/dashboard", label: "대시보드", icon: Home },
  { href: "/items", label: "내 품목", icon: LayoutGrid },
  { href: "/risks/283691", label: "리스크 분석", icon: CircleAlert, match: "/risks" },
  { href: "/recommendations", label: "대체 공급처", icon: Globe2 },
  { href: "/reports/new", label: "AI 보고서", icon: FileText, match: "/reports" },
  { href: "/settings", label: "설정", icon: Settings },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isActive = (item: (typeof NAV)[number]) =>
    pathname === item.href || (item.match ? pathname.startsWith(item.match) : false)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <Link href="/dashboard" className="flex h-16 items-center gap-2.5 border-b border-slate-100 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div>
          <span className="font-semibold tracking-tight">SupplyGuard</span>
        </Link>
        <div className="flex-1 p-4">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">메뉴</p>
          <nav className="space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon
              const active = isActive(item)
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
                  <Icon className="h-4 w-4" /> {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="mx-4 mb-5 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 p-4">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm"><Sparkles className="h-4 w-4" /></div>
          <p className="text-sm font-semibold">AI 리스크 브리핑</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">오늘의 공급망 변화를 확인하세요.</p>
          <Link href="/reports/new" className="mt-2 inline-block text-xs font-semibold text-blue-700">보고서 생성 →</Link>
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
