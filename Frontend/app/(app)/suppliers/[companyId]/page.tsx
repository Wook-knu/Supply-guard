"use client"

// 공급사(기업) 상세 — /suppliers/{companyId} 동적 경로.
// 실데이터: GET /companies/{id} (기업 공개 정보 + 조달 참고 지표)
//          ?query_id= 있으면 그 질의의 공급사 추천에서 적합도·근거를 함께 표시.

import Link from "next/link"
import { use, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, BadgeCheck, Bell, Building2, Check, ExternalLink, Globe2, MapPin, ShieldAlert, ShieldCheck, Truck } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { api, type CompanyDetail, type SupplierReco } from "@/lib/api"
import { getCountryName } from "@/lib/countries"

function num(v: string | number | null): number { return Number(v ?? 0) }
const toIds = (raw: string | null | undefined) => new Set((raw ?? "").split(",").map((s) => Number(s.trim())).filter(Boolean))

export default function SupplierDetailPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = use(params)
  const cid = Number(companyId)
  const router = useRouter()
  const queryId = Number(useSearchParams().get("query_id")) || null
  const [company, setCompany] = useState<CompanyDetail | null>(null)
  const [reco, setReco] = useState<SupplierReco | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [regIds, setRegIds] = useState<Set<number>>(new Set())    // 이 질의에서 등록한 기업들
  const [trIds, setTrIds] = useState<Set<number>>(new Set())      // 그중 거래중 기업들
  const [savingC, setSavingC] = useState(false)

  useEffect(() => {
    api.getCompany(cid)
      .then(setCompany)
      .catch(() => setCompany(null))
      .finally(() => setLoaded(true))
  }, [cid])

  // 질의 맥락이 있으면 이 회사의 추천 적합도·근거 + 등록/거래중 상태를 함께 불러온다.
  useEffect(() => {
    if (!queryId) return
    Promise.all([api.getSupplierRecos(queryId), api.getQuery(queryId)])
      .then(([rows, q]) => {
        setReco(rows.find((r) => r.company.company_id === cid) ?? null)
        const reg = toIds(q.registered_company_ids), tr = toIds(q.trading_company_ids)
        if (q.trading_company_id) { reg.add(q.trading_company_id); tr.add(q.trading_company_id) }
        setRegIds(reg); setTrIds(tr)
      })
      .catch(() => setReco(null))
  }, [queryId, cid])

  // 이 기업을 거래중/등록/해제로 지정
  async function setStatus(next: "trading" | "registered" | "none") {
    if (!queryId || savingC) return
    const reg = new Set(regIds), tr = new Set(trIds)
    if (next === "none") { reg.delete(cid); tr.delete(cid) }
    else if (next === "registered") { reg.add(cid); tr.delete(cid) }
    else { reg.add(cid); tr.add(cid) }
    const pr = regIds, pt = trIds
    setRegIds(reg); setTrIds(tr); setSavingC(true)
    try { await api.updateQuery(queryId, { registered_company_ids: [...reg].join(","), trading_company_ids: [...tr].join(","), trading_company_id: null }) }
    catch { setRegIds(pr); setTrIds(pt) }
    finally { setSavingC(false) }
  }

  const curStatus = trIds.has(cid) ? "trading" : regIds.has(cid) ? "registered" : "none"
  const fit = reco?.fit_score ? Math.round(num(reco.fit_score)) : null
  const onTime = company ? Math.round(num(company.on_time_delivery_rate)) : 0
  const defect = company ? num(company.defect_rate_pct) : 0

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link>
      <div className="flex items-center gap-3"><Button asChild variant="ghost" size="icon" className="relative text-slate-600"><Link href="/alerts"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Link></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div>
    </header>
    <main className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 뒤로</button>

      {!loaded ? <p className="mt-16 text-center text-sm text-slate-400">불러오는 중…</p>
        : !company ? <div className="mt-16 text-center text-sm text-slate-500">해당 공급사 정보를 찾을 수 없습니다.<div className="mt-3"><Button asChild variant="outline"><Link href="/recommendations">추천 목록으로</Link></Button></div></div>
        : <>
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row">
            <div className="flex gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Building2 className="h-7 w-7" /></div>
              <div>
                <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>{company.status === "active" && <Badge className="border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-50"><BadgeCheck className="mr-1 h-3.5 w-3.5" />공개 정보 확인</Badge>}</div>
                <p className="mt-2 text-sm text-slate-500">{getCountryName(company.country_code ?? "")}{company.name_en ? ` · ${company.name_en}` : ""}{company.company_type ? ` · ${company.company_type}` : ""}</p>
                <div className="mt-3 flex flex-wrap gap-2">{(company.certifications ?? []).map((c) => <Badge key={c} className="border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-50">{c}</Badge>)}{(company.certifications ?? []).length === 0 && <span className="text-xs text-slate-400">등록된 인증 정보 없음</span>}</div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{company.name_en || company.name}은(는) {getCountryName(company.country_code ?? "") || "해당 국가"} 소재 공급 기업입니다.{(company.hs_codes ?? []).length ? ` HS ${(company.hs_codes ?? []).slice(0, 3).join("·")} 품목을 취급하며,` : ""}{(company.certifications ?? []).length ? ` ${(company.certifications ?? []).join(", ")} 인증을 보유하고 있습니다.` : " 조달 지표는 아래를 참고하세요."}</p>
              </div>
            </div>
            {fit !== null && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-right"><p className="text-2xl font-semibold text-emerald-600">{fit}</p><p className="text-xs text-emerald-700">조달 적합도</p></div>}
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
            {/* 홈페이지: 등록돼 있으면 그 주소, 없으면 회사명 웹 검색으로 연결 */}
            <Button asChild variant="outline" className="border-slate-200"><a href={company.website || `https://www.google.com/search?q=${encodeURIComponent((company.name_en || company.name) + " official website")}`} target="_blank" rel="noreferrer"><Globe2 className="mr-2 h-4 w-4" />기업 홈페이지 <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a></Button>
            {queryId && (
              <span className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                {(() => { const seg = { trading: { active: "bg-blue-600 text-white", idle: "text-blue-600 hover:bg-blue-50" }, registered: { active: "bg-emerald-600 text-white", idle: "text-emerald-600 hover:bg-emerald-50" }, none: { active: "bg-rose-500 text-white", idle: "text-rose-500 hover:bg-rose-50" } }
                  return ([["trading", "거래중"], ["registered", "등록"], ["none", "해제"]] as const).map(([key, label], i) => (
                    <button key={key} type="button" disabled={savingC} onClick={() => setStatus(key)} className={`px-3.5 py-2 text-xs font-semibold transition-colors ${i > 0 ? "border-l border-slate-200" : ""} ${curStatus === key ? seg[key].active : `bg-white ${seg[key].idle}`}`}>{label}</button>
                  )) })()}
              </span>
            )}
            <Button asChild className="bg-blue-600 hover:bg-blue-700"><Link href={queryId ? `/reports/new?query_id=${queryId}` : "/reports/new"}>검토 보고서에 추가 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">조달 참고 지표</CardTitle><CardDescription className="mt-1">공개·등록 데이터 기반 참고 수치입니다.</CardDescription></CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <Stat label="예상 단가" value={company.unit_price ? `$${num(company.unit_price).toLocaleString()}${company.capacity_unit ? ` / ${company.capacity_unit}` : ""}` : "—"} />
                <Stat label="리드타임" value={company.lead_time_days ? `${company.lead_time_days}일` : "—"} />
                <Stat label="연간 공급능력" value={company.annual_capacity ? `${num(company.annual_capacity).toLocaleString()}${company.capacity_unit ? ` ${company.capacity_unit}` : ""}` : "—"} />
                <Stat label="가용 수량" value={company.available_quantity ? num(company.available_quantity).toLocaleString() : "—"} />
                <div><div className="mb-1.5 flex justify-between text-sm"><span className="text-slate-500">정시 납품률</span><span className="font-medium text-emerald-600">{onTime}%</span></div><Progress value={onTime} className="h-2" /></div>
                <div><div className="mb-1.5 flex justify-between text-sm"><span className="text-slate-500">불량률</span><span className={`font-medium ${defect > 3 ? "text-rose-600" : "text-emerald-600"}`}>{defect}%</span></div><Progress value={Math.min(defect * 10, 100)} className="h-2" /></div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">공개 기업 정보</CardTitle><CardDescription className="mt-1">등록·공개 자료 기반 참고 정보입니다.</CardDescription></CardHeader>
              <CardContent className="divide-y divide-slate-100">
                {[
                  ["기업명(영문)", company.name_en ?? "—"],
                  ["소재 국가", getCountryName(company.country_code ?? "") || "—"],
                  ["기업 유형", company.company_type ?? "—"],
                  ["취급 품목(HS)", (company.hs_codes ?? []).join(", ") || "—"],
                  ["상태", company.status ?? "—"],
                ].map(([key, value]) => <div className="flex justify-between gap-5 py-3 text-sm" key={key}><span className="text-slate-500">{key}</span><span className="text-right font-medium">{value}</span></div>)}
              </CardContent>
            </Card>
          </div>
          <aside className="space-y-6">
            <Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-sm">
              <CardHeader className="pb-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white"><ShieldCheck className="h-4 w-4" /></div><CardTitle className="mt-3 text-base">추천 이유</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-6 text-slate-700">{reco?.rationale || `${getCountryName(company.country_code ?? "")} 소재의 ${company.name} 공급사입니다.`} 아래 근거를 종합해 추천 후보로 선정했습니다.</p>
                <div className="space-y-3 border-t border-blue-100 pt-3">
                  {fit !== null && <Reason icon={ShieldCheck} title={`조달 적합도 ${fit}점`} text="소재 국가의 공급망 위험도(SGRI)와 조달 조건을 종합한 점수입니다. 높을수록 안정적으로 조달할 수 있습니다." />}
                  <Reason icon={Globe2} title={`소재 국가 · ${getCountryName(company.country_code ?? "") || "미상"}`} text={`${getCountryName(company.country_code ?? "")}의 SGRI 위험도(정책·물류 등)를 적합도에 반영했습니다. 국가 위험이 낮을수록 우선 검토 대상입니다.`} />
                  <Reason icon={Truck} title={`정시 납품률 ${onTime}%`} text={onTime >= 90 ? "납기 준수 신뢰도가 높아 생산 일정 리스크가 낮습니다." : onTime > 0 ? "납기 준수 이력을 확인한 뒤 계약을 권장합니다." : "정시 납품 데이터가 없어 사전 확인이 필요합니다."} />
                  {defect > 0 && <Reason icon={ShieldCheck} title={`불량률 ${defect}%`} text={defect <= 3 ? "품질 안정성이 양호한 수준입니다." : "품질 편차가 있을 수 있어 샘플 검수를 권장합니다."} />}
                  {(company.certifications ?? []).length > 0 && <Reason icon={BadgeCheck} title="보유 인증" text={`${(company.certifications ?? []).join(", ")} 인증을 보유해 품질·환경 기준을 충족합니다.`} />}
                  {company.lead_time_days != null && <Reason icon={Truck} title={`예상 리드타임 ${company.lead_time_days}일`} text="발주부터 납품까지 예상 기간입니다. 안전재고·발주 시점 계획에 참고하세요." />}
                  <Reason icon={MapPin} title="조달 다변화 가치" text="특정국·특정기업 의존도를 낮추는 대체 공급 후보로, 공급망 리스크 분산에 기여합니다." />
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">검토 전 확인 사항</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <CheckItem text="최소 주문 수량(MOQ) 확인" />
                <CheckItem text="정제·가공 단계 공급 가능 여부" />
                <CheckItem text="납기·인코텀즈 조건 협의" />
                <CheckItem text="샘플 및 품질 인증 검토" />
                <Button asChild className="mt-2 w-full bg-blue-600 hover:bg-blue-700"><Link href="/recommendations">다른 공급사 비교 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </>}
    </main>
  </div>
}

function Stat({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div> }
function Reason({ icon: Icon, title, text }: { icon: typeof Globe2; title: string; text: string }) { return <div className="flex gap-3"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-blue-600 shadow-sm"><Icon className="h-3.5 w-3.5" /></div><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{text}</p></div></div> }
function CheckItem({ text }: { text: string }) { return <div className="flex items-center gap-2"><Check className="h-4 w-4 text-blue-600" /><span>{text}</span></div> }
