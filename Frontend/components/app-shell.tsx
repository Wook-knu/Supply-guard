"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell, Box, CreditCard, FileText, FolderKanban, Globe2, Home, MoreHorizontal, Settings, ShieldAlert } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const nav = [
  { href: "/dashboard", label: "대시보드", icon: Home },
  { href: "/items", label: "품목 관리", icon: Box },
  { href: "/recommendations", label: "대체 공급처", icon: Globe2 },
  { href: "/alerts", label: "위험 알림", icon: Bell },
  { href: "/boards", label: "검토 보드", icon: FolderKanban },
  { href: "/reports/new", label: "AI 보고서", icon: FileText },
  { href: "/pricing", label: "구독·요금제", icon: CreditCard },
  { href: "/settings", label: "설정", icon: Settings },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname === "/" || pathname === "/login") return children
  return <div className="min-h-screen bg-slate-50">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-slate-200 bg-white lg:block">
      <Link href="/dashboard" className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500"><ShieldAlert className="h-4 w-4 text-white" /></span><span className="font-semibold">SupplyGuard</span></Link>
      <nav className="space-y-1 p-4">{nav.map(({ href, label, icon: Icon }) => { const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href)); return <Link key={href} href={href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="h-4 w-4" />{label}</Link> })}</nav>
      <Link href="/methodology" className="mx-4 block rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800"><p className="font-semibold">SGRI 방법론</p><p className="mt-1 text-xs leading-5 text-blue-600">6개 위험지표 산정 기준 보기</p></Link>
    </aside>
    <div className="pb-16 lg:pl-60 lg:pb-0">{children}</div>
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-slate-200 bg-white lg:hidden">{nav.slice(0, 5).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`flex min-w-14 flex-col items-center gap-1 text-[10px] ${pathname === href || pathname.startsWith(`${href}/`) ? "text-blue-600" : "text-slate-500"}`}><Icon className="h-4 w-4" />{label}</Link>)}<DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="더 많은 메뉴 열기" className={`flex min-w-14 flex-col items-center gap-1 text-[10px] ${nav.slice(5).some(({ href }) => pathname.startsWith(href)) || pathname === "/methodology" ? "text-blue-600" : "text-slate-500"}`}><MoreHorizontal className="h-4 w-4" />더보기</button></DropdownMenuTrigger><DropdownMenuContent side="top" align="end" className="mb-2 w-44">{nav.slice(5).map(({ href, label, icon: Icon }) => <DropdownMenuItem key={href} asChild><Link href={href}><Icon className="h-4 w-4" />{label}</Link></DropdownMenuItem>)}<DropdownMenuItem asChild><Link href="/methodology"><ShieldAlert className="h-4 w-4" />SGRI 방법론</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu></nav>
  </div>
}
