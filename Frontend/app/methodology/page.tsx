import Link from "next/link"
import { ArrowLeft, BarChart3, BookOpen, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const indicators = [
  ["S", "수급 불안정성", "수입량 변화와 공급 지속성을 평가합니다."],
  ["C", "공급처 집중도", "특정 국가 의존도와 공급국 분산 수준을 평가합니다."],
  ["V", "가격 변동성", "가격 변동 폭과 조달비용 불확실성을 평가합니다."],
  ["L", "물류 리스크", "항만 혼잡·운송 차질 등 물류 안정성을 평가합니다."],
  ["P", "국가·정책 리스크", "정치 안정성과 규제·제재 위험을 평가합니다."],
  ["E", "ESG·탄소규제", "환경·사회 위험과 탄소규제 노출을 평가합니다."],
] as const

export default function MethodologyPage() {
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex h-16 max-w-6xl items-center px-5 md:px-8"><Link href="/dashboard" className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500"><ShieldAlert className="h-4 w-4 text-white" /></span><span className="font-semibold">SupplyGuard</span></Link></div></header>
    <main className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" />대시보드로 돌아가기</Link>
      <section className="mt-6 rounded-2xl bg-gradient-to-br from-blue-700 to-cyan-600 p-7 text-white md:p-10"><Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10"><BookOpen className="mr-1.5 h-3.5 w-3.5" />산정 방법론</Badge><h1 className="mt-4 text-3xl font-semibold">SGRI 공급망 위험지수</h1><p className="mt-3 max-w-3xl leading-7 text-blue-50">국가·품목별 공급망 위험을 여섯 가지 지표로 표준화하고 가중 합산한 0~100점 지수입니다. 점수가 높을수록 공급 차질 가능성과 대응 필요성이 큽니다.</p></section>
      <section className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{indicators.map(([key, title, description]) => <Card key={key} className="border-slate-200 shadow-sm"><CardHeader className="pb-2"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-lg font-bold text-blue-700">{key}</span><CardTitle className="text-base">{title}</CardTitle></div></CardHeader><CardContent><p className="text-sm leading-6 text-slate-500">{description}</p></CardContent></Card>)}</section>
      <Card className="mt-7 border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-blue-600" />점수 해석</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-3"><ScoreRange color="bg-emerald-500" range="0~24점" label="낮음" text="상대적으로 안정적인 구간" /><ScoreRange color="bg-amber-500" range="25~49점" label="중간" text="지표별 취약요인 확인 필요" /><ScoreRange color="bg-rose-500" range="50~100점" label="높음" text="대체 공급처와 대응계획 검토" /></CardContent></Card>
      <p className="mt-5 text-xs leading-5 text-slate-400">SGRI는 의사결정을 지원하는 비교 지표이며 미래 사건을 확정적으로 예측하지 않습니다. 결측치와 데이터 기준일을 함께 확인하고 가격·품질·납기 조건과 종합해 판단해야 합니다.</p>
    </main>
  </div>
}

function ScoreRange({ color, range, label, text }: { color: string; range: string; label: string; text: string }) {
  return <div className="rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${color}`} /><span className="font-semibold">{label}</span><span className="ml-auto text-sm text-slate-400">{range}</span></div><p className="mt-2 text-sm text-slate-500">{text}</p></div>
}
