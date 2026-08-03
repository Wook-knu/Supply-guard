"use client"

// 인증 후 내부 페이지 공통 레이아웃 — 좌측 사이드바가 모든 페이지에서 유지된다.
// 접기/펼치기 지원(localStorage 저장). login/page 등은 이 그룹 밖이라 사이드바 없음.

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { ChevronsLeft, ChevronsRight, CircleAlert, CreditCard, FileText, Globe2, Home, LayoutGrid, Settings, ShieldAlert, Sparkles } from "lucide-react"

const NAV = [
  { href: "/dashboard", label: "대시보드", icon: Home },
  { href: "/items", label: "내 품목", icon: LayoutGrid },
  { href: "/risks/283691", label: "리스크 분석", icon: CircleAlert, match: "/risks" },
  { href: "/recommendations", label: "대체 공급처", icon: Globe2 },
  { href: "/reports/new", label: "AI 보고서", icon: FileText, match: "/reports" },
  { href: "/pricing", label: "요금제", icon: CreditCard },
  { href: "/settings", label: "설정", icon: Settings },
]

const COLLAPSE_KEY = "supplyguard:sidebar-collapsed"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1")
  }, [])

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0")
      return next
    })
  }

  const isActive = (item: (typeof NAV)[number]) =>
    pathname === item.href || (item.match ? pathname.startsWith(item.match) : false)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex ${collapsed ? "w-16" : "w-60"}`}>
        <div className={`flex h-16 items-center border-b border-slate-100 px-3 ${collapsed ? "justify-center" : "gap-2"}`}>
          {!collapsed && (
            <Link href="/dashboard" className="flex flex-1 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div>
              <span className="font-semibold tracking-tight">SupplyGuard</span>
            </Link>
          )}
          <button type="button" onClick={toggle} title={collapsed ? "펼치기" : "접기"}
            aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex-1 p-3">
          {!collapsed && <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">메뉴</p>}
          <nav className="space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon
              const active = isActive(item)
              return (
                <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
                  className={`flex items-center rounded-md py-2 text-sm font-medium transition-colors ${collapsed ? "justify-center px-0" : "gap-3 px-3"} ${active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
                  <Icon className="h-4 w-4 shrink-0" />{!collapsed && item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        {!collapsed && (
          <div className="mx-3 mb-3 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 p-4">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm"><Sparkles className="h-4 w-4" /></div>
            <p className="text-sm font-semibold">AI 리스크 브리핑</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">오늘의 공급망 변화를 확인하세요.</p>
            <Link href="/reports/new" className="mt-2 inline-block text-xs font-semibold text-blue-700">보고서 생성 →</Link>
          </div>
        )}
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
