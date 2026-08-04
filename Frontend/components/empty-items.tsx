"use client"

// 등록된 품목이 없을 때 보여주는 안내.
// 품목을 골라야 동작하는 화면(지도·SGRI 비교·벤치마크)이 공유한다.
// 전에는 특정 HS(283691)를 기본값으로 박아 억지로 화면을 채웠는데,
// 그 하드코딩을 없애면서 "무엇을 해야 하는지"를 알려주는 자리로 대체했다.

import Link from "next/link"
import { LayoutGrid, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function EmptyItems({ description }: { description?: string }) {
  return (
    <Card className="mt-6 border-dashed border-slate-300 shadow-none">
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <LayoutGrid className="h-6 w-6" />
        </span>
        <p className="text-sm font-semibold text-slate-700">등록된 품목이 없습니다</p>
        <p className="max-w-sm text-sm leading-6 text-slate-500">
          {description ?? "모니터링할 품목을 등록하면 이 화면에서 바로 분석할 수 있습니다."}
        </p>
        <Button asChild className="mt-1 bg-blue-600 hover:bg-blue-700">
          <Link href="/items/new"><Plus className="mr-1.5 h-4 w-4" />품목 등록</Link>
        </Button>
        <p className="mt-1 text-xs text-slate-400">HS 코드를 알고 있다면 위 입력칸에 직접 넣어 조회할 수도 있습니다.</p>
      </CardContent>
    </Card>
  )
}
