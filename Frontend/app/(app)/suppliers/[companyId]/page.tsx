"use client"

// 공급사(기업) 상세 — /suppliers/{companyId} 동적 경로.
// 실데이터: GET /companies/{id} (기업 공개 정보 + 조달 참고 지표)
//          ?query_id= 있으면 그 질의의 공급사 추천에서 적합도·근거를 함께 표시.

import Link from "next/link"
import { use, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, BadgeCheck, Bell, Building2, Check, ExternalLink, Globe2, MapPin, ShieldAlert, ShieldCheck, Truck } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { api, type CompanyDetail, type SupplierReco } from "@/lib/api"
import { getCountryName } from "@/lib/countries"

function num(v: string | number | null): number { return Number(v ?? 0) }

export default function SupplierDetailPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = use(params)
  const queryId = Number(useSearchParams().get("query_id")) || null
  const [company, setCompany] = useState<CompanyDetail | null>(null)
  const [reco, setReco] = useState<SupplierReco | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.getCompany(Number(companyId))
      .then(setCompany)
      .catch(() => setCompany(null))
      .finally(() => setLoaded(true))
  }, [companyId])

  // 질의 맥락이 있으면 이 회사의 추천 적합도·근거를 함께 불러온다.
  useEffect(() => {
    if (!queryId) return
    api.getSupplierRecos(queryId)
      .then((rows) => setReco(rows.find((r) => r.company.company_id === Number(companyId)) ?? null))
      .catch(() => setReco(null))
  }, [queryId, companyId])

  const fit = reco?.fit_score ? Math.round(num(reco.fit_score)) : null
  const onTime = company ? Math.round(num(company.on_time_delivery_rate)) : 0
  const defect = company ? num(company.defect_rate_pct) : 0

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <Link href="/dashboard" className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-sm"><ShieldAlert className="h-4 w-4 text-white" /></div><span className="font-semibold tracking-tight">SupplyGuard</span></Link>
      <div className="flex items-center gap-3"><Button asChild variant="ghost" size="icon" className="relative text-slate-600"><Link href="/alerts"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" /></Link></Button><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">SW</AvatarFallback></Avatar></div>
    </header>
    <main className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <Link href="/recommendations" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> 대체 공급처 추천으로 돌아가기</Link>

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
          <div className="mt-7 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
            {company.website && <Button asChild variant="outline" className="border-slate-200"><a href={company.website} target="_blank" rel="noreferrer"><Globe2 className="mr-2 h-4 w-4" />기업 홈페이지 <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a></Button>}
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
                {reco?.rationale
                  ? <p className="text-sm leading-6 text-slate-600">{reco.rationale}</p>
                  : <>
                    <Reason icon={Globe2} title="공급 국가" text={`${getCountryName(company.country_code ?? "")} 기반 공급사입니다.`} />
                    <Reason icon={Truck} title="납품 신뢰도" text={`정시 납품률 ${onTime}% 수준입니다.`} />
                    <Reason icon={MapPin} title="다변화 후보" text="조달처 다변화 후보로 검토할 수 있습니다." />
                  </>}
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
