"use client"

import { useState } from "react"
import Link from "next/link"
import { Info, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const indicators = [
  ["S", "수급 불안정성"], ["C", "공급처 집중도"], ["V", "가격 변동성"],
  ["L", "물류 리스크"], ["P", "국가·정책 리스크"], ["E", "ESG·탄소규제"],
]

export function SgriInfo({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return <><button type="button" aria-label="SGRI 설명 보기" onClick={() => setOpen(true)} className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-blue-50 hover:text-blue-600 ${className}`}><Info className="h-4 w-4" /></button>
    {open && <div role="dialog" aria-modal="true" aria-label="SGRI 설명" className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/40 p-4" onClick={() => setOpen(false)}><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-lg font-semibold">SGRI란?</p><p className="mt-1 text-sm text-slate-500">공급망 위험을 0~100점으로 나타낸 종합지수입니다.</p></div><button type="button" aria-label="닫기" onClick={() => setOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-2 sm:grid-cols-2">{indicators.map(([key, label]) => <div key={key} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-700">{key}</span><span className="text-sm font-medium text-slate-700">{label}</span></div>)}</div><div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">0~24 낮음</div><div className="rounded-lg bg-amber-50 p-2 text-amber-700">25~49 중간</div><div className="rounded-lg bg-rose-50 p-2 text-rose-700">50~100 높음</div></div><Button asChild className="mt-5 w-full bg-blue-600 hover:bg-blue-700"><Link href="/methodology" onClick={() => setOpen(false)}>전체 산정 방법 보기</Link></Button></div></div>}
  </>
}
