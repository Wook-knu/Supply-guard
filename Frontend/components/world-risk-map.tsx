"use client"

// 세계지도 — 공급국을 SGRI 색으로 표시. 모두의마블식 비주얼:
//  · 한국(수입 허브)에서 각 공급국으로 뻗는 "흐르는 경로선"
//  · 마커 레이더 펄스, 허브 핀
// 드래그 이동 + 확대/축소 + 국가 라벨. 마커 클릭 시 상위로 국가 코드를 알린다.

import { useState } from "react"
import { ComposableMap, Geographies, Geography, Line, Marker, ZoomableGroup } from "react-simple-maps"
import { COUNTRY_COORDS } from "@/lib/country-coords"
import { getCountryName } from "@/lib/countries"

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
const HUB: [number, number] = COUNTRY_COORDS.KR // 한국(수입 허브)

export type RiskPoint = { code: string; sgri: number | null }

export function riskColor(sgri: number | null): string {
  if (sgri == null) return "#94a3b8"
  if (sgri >= 60) return "#ef4444"
  if (sgri >= 35) return "#f59e0b"
  return "#10b981"
}

export default function WorldRiskMap({ points, selected, onSelect, showLabels = false, height = 460, preview = false, fill = false, animated = true }: {
  points: RiskPoint[]
  selected?: string | null
  onSelect?: (code: string) => void
  showLabels?: boolean
  height?: number
  preview?: boolean
  fill?: boolean
  animated?: boolean
}) {
  const [view, setView] = useState<{ coordinates: [number, number]; zoom: number }>({ coordinates: [12, 18], zoom: 1 })
  const z = view.zoom

  const geos = (
    <Geographies geography={GEO_URL}>
      {({ geographies }) =>
        geographies.map((geo) => (
          <Geography key={geo.rsmKey} geography={geo} fill="#e9eef4" stroke="#d3dbe4" strokeWidth={0.3}
            style={{ default: { outline: "none" }, hover: { outline: "none", fill: preview ? "#e9eef4" : "#dfe6ee" }, pressed: { outline: "none" } }} />
        ))
      }
    </Geographies>
  )

  // 한국 허브 → 공급국 경로선 (흐르는 대시)
  const routes = animated ? points.map((p) => {
    const to = COUNTRY_COORDS[p.code]
    if (!to || p.code === "KR") return null
    return (
      <Line key={`route-${p.code}`} from={HUB} to={to} stroke={riskColor(p.sgri)} strokeWidth={1.1 / z}
        strokeLinecap="round" strokeDasharray="2 5" opacity={selected === p.code ? 0.85 : 0.45} className="sg-route" />
    )
  }) : null

  const markers = points.map((p) => {
    const coord = COUNTRY_COORDS[p.code]
    if (!coord) return null
    const active = selected === p.code
    const color = riskColor(p.sgri)
    const base = (active ? 6 : 4.5) / z
    return (
      <Marker key={p.code} coordinates={coord} onClick={preview ? undefined : () => onSelect?.(p.code)}>
        {animated && (
          <circle r={base} fill={color}>
            <animate attributeName="r" values={`${base};${base * 3.4};${base * 3.4}`} dur="1.9s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.45;0;0" dur="1.9s" repeatCount="indefinite" />
          </circle>
        )}
        {active && <circle r={base * 2} fill="none" stroke={color} strokeWidth={1.3 / z} opacity={0.6} />}
        <circle r={base} fill={color} stroke="#fff" strokeWidth={1.4 / z} style={{ cursor: preview ? "inherit" : "pointer" }} />
        {showLabels && (
          <text textAnchor="middle" y={-base - 4 / z} style={{ fontSize: 10 / z, fill: "#334155", fontWeight: 600, pointerEvents: "none" }}>{getCountryName(p.code)}</text>
        )}
      </Marker>
    )
  })

  // 허브(한국) 핀
  const hub = (
    <Marker coordinates={HUB}>
      <circle r={5.5 / z} fill="#2563eb" stroke="#fff" strokeWidth={1.6 / z} />
      <circle r={2 / z} fill="#fff" />
      {showLabels && <text textAnchor="middle" y={-9 / z} style={{ fontSize: 10 / z, fill: "#1e3a8a", fontWeight: 700, pointerEvents: "none" }}>한국(수입)</text>}
    </Marker>
  )

  const inner = (
    <>
      {geos}
      {routes}
      {markers}
      {hub}
    </>
  )

  return (
    <div className={`relative w-full overflow-hidden ${fill ? "h-full" : "rounded-xl bg-slate-50/40"}`} style={preview ? { pointerEvents: "none" } : undefined}>
      <style>{`.sg-route{animation:sgdash 1.1s linear infinite}@keyframes sgdash{to{stroke-dashoffset:-14}}`}</style>
      {!preview && (
        <div className="absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <button type="button" aria-label="확대" onClick={() => setView((v) => ({ ...v, zoom: Math.min(v.zoom * 1.5, 8) }))} className="flex h-8 w-8 items-center justify-center text-lg text-slate-600 hover:bg-slate-100">+</button>
          <button type="button" aria-label="축소" onClick={() => setView((v) => ({ ...v, zoom: Math.max(v.zoom / 1.5, 1) }))} className="flex h-8 w-8 items-center justify-center border-t border-slate-100 text-lg text-slate-600 hover:bg-slate-100">−</button>
        </div>
      )}
      <ComposableMap projection="geoEqualEarth" width={800} height={height} style={{ width: "100%", height: fill ? "100%" : "auto" }}>
        {preview ? inner : (
          <ZoomableGroup center={view.coordinates} zoom={view.zoom} minZoom={1} maxZoom={8} onMoveEnd={(v: { coordinates: [number, number]; zoom: number }) => setView(v)}>
            {inner}
          </ZoomableGroup>
        )}
      </ComposableMap>
    </div>
  )
}
