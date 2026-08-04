"use client"

// 인증 후 내부 페이지 공통 레이아웃.
// 데스크탑(lg+): 좌측 사이드바가 모든 페이지에서 유지된다. 접기/펼치기 지원(localStorage 저장).
// 모바일(lg 미만): 사이드바가 숨겨지므로 하단 탭바 + '더보기' 시트로 같은 메뉴에 도달한다.
// login/page 등은 이 그룹 밖이라 사이드바·탭바 없음.

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { BarChart3, ChevronsLeft, ChevronsRight, ClipboardList, CreditCard, FileText, GitCompareArrows, Home, LayoutGrid, Map, Menu, Settings, ShieldAlert, TrendingUp, X } from "lucide-react"
import ChatWidget from "@/components/chat-widget"

type NavItem = { href: string; label: string; icon: typeof Home; match?: string }

const NAV: NavItem[] = [
  { href: "/dashboard", label: "대시보드", icon: Home },
  { href: "/items", label: "내 품목", icon: LayoutGrid },
  { href: "/map", label: "글로벌 지도", icon: Map },
  { href: "/compare", label: "SGRI 비교하기", icon: GitCompareArrows },
  { href: "/benchmark", label: "벤치마크", icon: BarChart3 },
  { href: "/boards", label: "검토 보드", icon: ClipboardList },
  { href: "/reports/new", label: "AI 보고서", icon: FileText, match: "/reports" },
  { href: "/pricing", label: "요금제", icon: CreditCard },
  { href: "/settings", label: "설정", icon: Settings },
]

// 최신동향은 데스크탑에선 사이드바 하단 배너로 진입한다. 모바일엔 그 배너가 없어
// 탭바에 정식 항목으로 넣어야 도달할 수 있다.
const TRENDS: NavItem = { href: "/trends", label: "최신동향", icon: TrendingUp }

// 모바일 하단 탭바: 자주 쓰는 4개 + 더보기. 나머지는 시트에서 연다.
const MOBILE_TABS: NavItem[] = [NAV[0], NAV[1], NAV[2], TRENDS]
const MOBILE_TAB_HREFS = new Set(MOBILE_TABS.map((item) => item.href))
const MOBILE_MORE: NavItem[] = NAV.filter((item) => !MOBILE_TAB_HREFS.has(item.href))

const COLLAPSE_KEY = "supplyguard:sidebar-collapsed"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1")
  }, [])

  // 페이지가 바뀌면 더보기 시트를 닫는다(탭 이동 후 시트가 남지 않도록).
  useEffect(() => { setMoreOpen(false) }, [pathname])

  // 시트가 열려 있을 때 배경 스크롤을 막는다.
  useEffect(() => {
    if (!moreOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = previous }
  }, [moreOpen])

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0")
      return next
    })
  }

  const isActive = (item: NavItem) =>
    pathname === item.href || (item.match ? pathname.startsWith(item.match) : false)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex ${collapsed ? "w-16" : "w-60"}`}>
        {/* 접힌 상태(w-16)에선 로고와 버튼을 나란히 둘 폭이 없어 세로로 쌓는다.
            로고를 아예 숨기면 브랜드가 사라지므로 아이콘만 남긴다. */}
        <div className={`flex border-b border-slate-100 px-3 ${collapsed ? "flex-col items-center gap-1 py-2" : "h-16 items-center gap-2"}`}>
          <Link href="/dashboard" aria-label="대시보드"
            className={`flex shrink-0 items-center ${collapsed ? "" : "flex-1 gap-2.5"}`}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div>
            {!collapsed && <span className="font-semibold tracking-tight">SupplyGuard</span>}
          </Link>
          <button type="button" onClick={toggle} title={collapsed ? "펼치기" : "접기"}
            aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-all duration-200 hover:bg-slate-100 hover:text-slate-700 active:scale-95">
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
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center rounded-md py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98] ${collapsed ? "justify-center px-0" : "gap-3 px-3"} ${active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
                  <Icon className="h-4 w-4 shrink-0" />{!collapsed && item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        {!collapsed && (
          <Link href="/trends" className="mx-3 mb-3 block rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm"><TrendingUp className="h-4 w-4" /></div>
            <p className="text-sm font-semibold">최신동향 분석</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">등록 품목의 국가·기업 현황과 SGRI를 AI가 요약합니다.</p>
            <span className="mt-2 inline-block text-xs font-semibold text-blue-700">분석 보기 →</span>
          </Link>
        )}
      </aside>

      {/* pb-16: 모바일 하단 탭바에 콘텐츠 마지막 줄이 가리지 않도록 여백을 준다. */}
      <div className="min-w-0 flex-1 pb-16 lg:pb-0">{children}</div>

      {/* ── 모바일 하단 탭바 (lg 미만) ── */}
      <nav aria-label="주요 메뉴" className="fixed bottom-0 left-0 right-0 z-40 flex h-16 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        {MOBILE_TABS.map((item) => {
          const Icon = item.icon
          const active = isActive(item)
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:scale-[0.97] ${active ? "text-blue-600" : "text-slate-500"}`}>
              <Icon className="h-5 w-5 shrink-0" />
              <span className="max-w-full truncate px-1">{item.label}</span>
            </Link>
          )
        })}
        <button type="button" onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen} aria-label="전체 메뉴 열기"
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:scale-[0.97] ${moreOpen || MOBILE_MORE.some(isActive) ? "text-blue-600" : "text-slate-500"}`}>
          <Menu className="h-5 w-5 shrink-0" />
          <span>더보기</span>
        </button>
      </nav>

      {/* ── 더보기 시트: 탭바에 담지 못한 메뉴 ── */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="메뉴 닫기" onClick={() => setMoreOpen(false)}
            className="absolute inset-0 h-full w-full bg-slate-900/40" />
          <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white pb-6 shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <p className="font-semibold">전체 메뉴</p>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="메뉴 닫기"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="p-3">
              {MOBILE_MORE.map((item) => {
                const Icon = item.icon
                const active = isActive(item)
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${active ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"}`}>
                    <Icon className="h-4 w-4 shrink-0" />{item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
      )}

      <ChatWidget />
    </div>
  )
}
