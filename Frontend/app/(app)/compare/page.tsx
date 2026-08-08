"use client"

// 비교하기 — 한 품목의 후보 국가들을 6지표·SGRI로 나란히 비교한다.
// 백엔드: GET /risks?hs_code= (country_risk_scores). 국가별 최신값으로 정렬.

import Link from "next/link"
import BackLink from "@/components/back-link"
import { useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useState } from "react"
import UserAvatar from "@/components/user-avatar"
import AlertBell from "@/components/alert-bell"
import { api, type QueryOut, type RiskOut } from "@/lib/api"
import { COUNTRY_OPTIONS, getCountryName } from "@/lib/countries"
import { ArrowLeft, GitCompareArrows, Loader2, MapPin, ShieldAlert, Trophy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const INDICATORS: { key: keyof RiskOut; code: string; label: string }[] = [
  { key: "score_s", code: "S", label: "수급" },
  { key: "score_c", code: "C", label: "집중도" },
  { key: "score_v", code: "V", label: "가격" },
  { key: "score_l", code: "L", label: "물류" },
  { key: "score_p", code: "P", label: "정책" },
  { key: "score_e", code: "E", label: "ESG" },
]

// 위험도 값(0~100) → 셀 배경색. 낮을수록 안전(초록), 높을수록 위험(빨강).
const cellCls = (v: number | null) => {
  if (v == null) return "text-slate-300"
  if (v >= 60) return "bg-rose-50 text-rose-700 font-semibold"
  if (v >= 35) return "bg-amber-50 text-amber-700"
  return "bg-emerald-50 text-emerald-700"
}
const num = (s: string | null) => (s == null ? null : Math.round(Number(s)))

export default function ComparePageWrapper() {
  return <Suspense fallback={<div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
    <ComparePage />
  </Suspense>
}

function ComparePage() {
  const params = useSearchParams()
  const urlHs = params.get("hs")?.replace(/\D/g, "") || ""
  const [items, setItems] = useState<QueryOut[]>([])
  const [hs, setHs] = useState(urlHs || "")
  const [rows, setRows] = useState<RiskOut[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    api.getQueries()
      .then((qs) => {
        const withHs = qs.filter((r) => r.hs_code)
        setItems(withHs)
        // URL로 hs가 지정되면 그것을 유지, 아니면 첫 품목을 자동 선택하고 바로 조회.
        if (!urlHs && withHs[0]?.hs_code) { setHs(withHs[0].hs_code); load(withHs[0].hs_code) }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = (hsCode: string) => {
    const clean = hsCode.replace(/[^0-9]/g, "")
    if (!clean) return
    setLoading(true)
    api.getRisks(clean)
      .then((r) => { setRows(r); setError(r.length === 0 ? "해당 품목의 국가별 SGRI 데이터가 아직 없습니다. 먼저 품목을 분석해 주세요." : "") })
      .catch(() => setError("데이터를 불러오지 못했습니다."))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(hs) /* eslint-disable-next-line */ }, [])

  // 국가별 최신 레코드만 남기고 SGRI 오름차순(안전한 국가부터)
  const countries = useMemo(() => {
    const latest = new Map<string, RiskOut>()
    rows.forEach((r) => {
      const cur = latest.get(r.country_code)
      if (!cur || r.as_of_date > cur.as_of_date) latest.set(r.country_code, r)
    })
    return [...latest.values()].sort((a, b) => Number(a.sgri_score ?? 999) - Number(b.sgri_score ?? 999))
  }, [rows])

  const selectedItem = useMemo(() => items.find((i) => i.hs_code === hs), [items, hs])
  const itemName = selectedItem?.item_name

  // 현재 거래 중인 공급국(등록 시 입력, 콤마구분 국가명) → 국가코드 집합으로 변환
  const originCodes = useMemo(() => {
    if (!selectedItem?.origin_country) return new Set<string>()
    const codes = selectedItem.origin_country.split(",").map((s) => {
      const t = s.trim()
      const m = COUNTRY_OPTIONS.find((o) => o.name === t || o.code === t.toUpperCase())
      return m?.code ?? t.toUpperCase()
    })
    return new Set(codes)
  }, [selectedItem])

  // 현재 거래국의 SGRI (대체국과 비교 기준선)
  const originSgri = useMemo(() => {
    const vals = countries.filter((c) => originCodes.has(c.country_code)).map((c) => Number(c.sgri_score ?? NaN)).filter((n) => !Number.isNaN(n))
    return vals.length ? Math.min(...vals) : null
  }, [countries, originCodes])

  // 두 국가 1:1 비교 (URL ?a=&b= 로 지정 가능 — 추천 페이지에서 넘어옴)
  const [codeA, setCodeA] = useState(params.get("a") ?? "")
  const [codeB, setCodeB] = useState(params.get("b") ?? "")
  useEffect(() => {
    if (!countries.length) return
    setCodeA((p) => (p && countries.some((c) => c.country_code === p) ? p : countries[0].country_code))
    setCodeB((p) => (p && countries.some((c) => c.country_code === p) ? p : (countries[1]?.country_code ?? countries[0].country_code)))
  }, [countries])
  const cA = countries.find((c) => c.country_code === codeA)
  const cB = countries.find((c) => c.country_code === codeB)
  const COMPARE_ROWS: { key: keyof RiskOut; code: string; label: string }[] = [...INDICATORS, { key: "sgri_score", code: "SGRI", label: "종합" }]

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex h-16 items-center justify-between lg:justify-end border-b border-slate-200 bg-white px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5 lg:hidden"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link>
        <div className="flex items-center gap-3"><AlertBell /><UserAvatar /></div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 md:px-8">
        <BackLink />
        <div className="mt-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><GitCompareArrows className="h-4 w-4" /> 비교하기</div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">후보 국가를 한눈에 비교하세요</h1>
            <p className="mt-2 text-sm text-slate-500">선택한 품목의 조달 후보 국가들을 6개 지표와 종합 SGRI로 나란히 비교합니다. 낮을수록 안전합니다.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">품목 선택</label>
            {items.length > 0 ? (
              <select value={hs} onChange={(e) => { setHs(e.target.value); load(e.target.value) }} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                {items.map((i) => <option key={i.query_id} value={i.hs_code ?? ""}>{i.item_name} (HS {i.hs_code})</option>)}
              </select>
            ) : (
              <div className="flex gap-2"><input value={hs} onChange={(e) => setHs(e.target.value)} placeholder="예: 283691" className="h-10 w-36 rounded-md border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" /><Button onClick={() => load(hs)} className="h-10 bg-blue-600 hover:bg-blue-700">조회</Button></div>
            )}
          </div>
        </div>

        {error && <div role="alert" className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{error}</div>}

        {!loading && countries.length > 1 && (
          <div className="mt-6 rounded-2xl border-2 border-blue-200 bg-white p-5 shadow-sm">
            <p className="text-base font-semibold">두 국가 1:1 비교</p>
            <p className="mt-1 text-sm text-slate-500">지표별로 <span className="font-medium text-emerald-600">낮은 쪽(안전)은 초록</span>, <span className="font-medium text-rose-600">높은 쪽(위험)은 빨강</span>으로 표시합니다.</p>
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <select value={codeA} onChange={(e) => setCodeA(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500">{countries.map((c) => <option key={c.country_code} value={c.country_code}>{getCountryName(c.country_code)} ({c.country_code})</option>)}</select>
              <span className="text-sm font-medium text-slate-400">vs</span>
              <select value={codeB} onChange={(e) => setCodeB(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500">{countries.map((c) => <option key={c.country_code} value={c.country_code}>{getCountryName(c.country_code)} ({c.country_code})</option>)}</select>
            </div>
            <div className="mt-4 space-y-1.5">
              {COMPARE_ROWS.map((ind) => {
                const a = num(cA?.[ind.key] as string | null)
                const b = num(cB?.[ind.key] as string | null)
                const eq = a != null && b != null && a === b
                const aWin = a != null && b != null && a < b   // a가 더 낮음(안전)
                const diff = a != null && b != null ? Math.abs(a - b) : null
                const cell = (win: boolean, lose: boolean) => eq ? "bg-slate-50 text-slate-500" : win ? "bg-emerald-50 text-emerald-700 font-bold ring-1 ring-emerald-200" : lose ? "bg-rose-50 text-rose-600 font-bold ring-1 ring-rose-200" : "bg-slate-50 text-slate-500"
                const isSgri = ind.code === "SGRI"
                return (
                  <div key={ind.code} className={`grid grid-cols-[1fr_7rem_1fr] items-center gap-2 ${isSgri ? "mt-2 border-t border-slate-200 pt-3" : ""}`}>
                    <div className={`flex items-center justify-end gap-1.5 rounded-lg px-3 py-2 ${cell(aWin && !eq, !aWin && !eq && a != null && b != null)}`}>{aWin && !eq && diff ? <span className="text-[11px]">▼{diff}</span> : (!aWin && !eq && a != null && b != null && diff ? <span className="text-[11px]">▲{diff}</span> : null)}<span className={isSgri ? "text-lg" : "text-base"}>{a ?? "–"}</span></div>
                    <div className="text-center"><span className={`font-bold ${isSgri ? "text-sm text-slate-800" : "text-xs text-slate-600"}`}>{ind.code}</span><span className="block text-[11px] text-slate-400">{ind.label}</span></div>
                    <div className={`flex items-center justify-start gap-1.5 rounded-lg px-3 py-2 ${cell(!aWin && !eq && a != null && b != null, aWin && !eq)}`}><span className={isSgri ? "text-lg" : "text-base"}>{b ?? "–"}</span>{!aWin && !eq && a != null && b != null && diff ? <span className="text-[11px]">▼{diff}</span> : (aWin && !eq && diff ? <span className="text-[11px]">▲{diff}</span> : null)}</div>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-center text-xs text-slate-400"><span className="font-medium text-emerald-600">초록 ▼</span> 더 낮음(안전) · <span className="font-medium text-rose-600">빨강 ▲</span> 더 높음(위험) · 숫자는 상대와의 차이</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : countries.length > 0 ? (
          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-slate-500">
                  <th className="px-4 py-3 text-left font-medium">국가</th>
                  {INDICATORS.map((ind) => <th key={ind.code} className="px-3 py-3 text-center font-medium" title={ind.label}><span className="font-bold text-slate-600">{ind.code}</span><span className="ml-1 hidden text-xs text-slate-400 lg:inline">{ind.label}</span></th>)}
                  <th className="px-4 py-3 text-center font-semibold text-slate-700">SGRI</th>
                  <th className="px-4 py-3 text-center font-medium">등급</th>
                </tr>
              </thead>
              <tbody>
                {countries.map((c, idx) => {
                  const isOrigin = originCodes.has(c.country_code)
                  const sgriVal = num(c.sgri_score)
                  // 현재국 대비 SGRI 차이(대체국이 얼마나 더 안전/위험한지). 음수 = 더 안전.
                  const vsOrigin = !isOrigin && originSgri != null && sgriVal != null ? sgriVal - Math.round(originSgri) : null
                  return (
                  <tr key={c.country_code} className={`border-b border-slate-50 last:border-0 ${isOrigin ? "bg-blue-50/50" : idx === 0 ? "bg-emerald-50/30" : ""}`}>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      <span className="inline-flex flex-wrap items-center gap-1.5">{idx === 0 && !isOrigin && <Trophy className="h-3.5 w-3.5 text-emerald-500" />}{getCountryName(c.country_code)}<span className="text-xs font-normal text-slate-400">{c.country_code}</span>{isOrigin && <Badge className="border-0 bg-blue-600 px-1.5 py-0 text-[10px] text-white hover:bg-blue-600"><MapPin className="mr-0.5 h-2.5 w-2.5" />현재 거래국</Badge>}</span>
                    </td>
                    {INDICATORS.map((ind) => {
                      const v = num(c[ind.key] as string | null)
                      return <td key={ind.code} className="px-1.5 py-1.5 text-center"><span className={`inline-block min-w-9 rounded-md px-2 py-1 ${cellCls(v)}`}>{v ?? "–"}</span></td>
                    })}
                    <td className="px-4 py-3 text-center">
                      <span className="text-base font-bold text-slate-800">{sgriVal ?? "–"}</span>
                      {vsOrigin != null && vsOrigin !== 0 && <span className={`ml-1.5 text-xs font-semibold ${vsOrigin < 0 ? "text-emerald-600" : "text-rose-500"}`}>{vsOrigin < 0 ? `▼${-vsOrigin}` : `▲${vsOrigin}`}</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className={c.level === "높음" ? "border-rose-200 bg-rose-50 text-rose-600" : c.level === "중간" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{c.level}</Badge>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-100" /> 안전(&lt;35)</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-100" /> 주의(35~60)</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-rose-100" /> 위험(≥60)</span>
              {originSgri != null && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-blue-500" /> 현재 거래국 · <span className="text-emerald-600">▼더 안전</span>/<span className="text-rose-500">▲더 위험</span></span>}
              <span className="ml-auto"><Trophy className="mr-1 inline h-3 w-3 text-emerald-500" />최저 위험 후보 {itemName ?? ""}</span>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
