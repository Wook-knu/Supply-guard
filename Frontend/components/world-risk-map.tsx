"use client"

// 세계지도 — 공급국을 SGRI 위험도 색으로 표시. 드래그(이동)·휠/버튼(확대·축소) 지원,
// 국가 이름 라벨 표시, 마커 클릭 시 상위로 국가 코드를 알린다. react-simple-maps 사용.

import { useState } from "react"
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps"
import { COUNTRY_COORDS } from "@/lib/country-coords"
import { getCountryName } from "@/lib/countries"

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

export type RiskPoint = { code: string; sgri: number | null }

export function riskColor(sgri: number | null): string {
  if (sgri == null) return "#94a3b8"
  if (sgri >= 60) return "#ef4444"
  if (sgri >= 35) return "#f59e0b"
  return "#10b981"
}

export default function WorldRiskMap({ points, selected, onSelect, showLabels = false, height = 460 }: {
  points: RiskPoint[]
  selected?: string | null
  onSelect?: (code: string) => void
  showLabels?: boolean
  height?: number
}) {
  const [view, setView] = useState<{ coordinates: [number, number]; zoom: number }>({ coordinates: [12, 18], zoom: 1 })

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-slate-50/40">
      <div className="absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <button type="button" aria-label="확대" onClick={() => setView((v) => ({ ...v, zoom: Math.min(v.zoom * 1.5, 8) }))} className="flex h-8 w-8 items-center justify-center text-lg text-slate-600 hover:bg-slate-100">+</button>
        <button type="button" aria-label="축소" onClick={() => setView((v) => ({ ...v, zoom: Math.max(v.zoom / 1.5, 1) }))} className="flex h-8 w-8 items-center justify-center border-t border-slate-100 text-lg text-slate-600 hover:bg-slate-100">−</button>
      </div>
      <ComposableMap projection="geoEqualEarth" width={800} height={height} style={{ width: "100%", height: "auto" }}>
        <ZoomableGroup center={view.coordinates} zoom={view.zoom} minZoom={1} maxZoom={8} onMoveEnd={(v: { coordinates: [number, number]; zoom: number }) => setView(v)}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography key={geo.rsmKey} geography={geo} fill="#e9eef4" stroke="#d3dbe4" strokeWidth={0.3}
                  style={{ default: { outline: "none" }, hover: { outline: "none", fill: "#dfe6ee" }, pressed: { outline: "none" } }} />
              ))
            }
          </Geographies>
          {points.map((p) => {
            const coord = COUNTRY_COORDS[p.code]
            if (!coord) return null
            const active = selected === p.code
            const color = riskColor(p.sgri)
            return (
              <Marker key={p.code} coordinates={coord} onClick={() => onSelect?.(p.code)}>
                {active && <circle r={12 / view.zoom} fill={color} opacity={0.25} />}
                <circle r={(active ? 7 : 5) / view.zoom} fill={color} stroke="#fff" strokeWidth={1.4 / view.zoom} style={{ cursor: "pointer" }} />
                {showLabels && (
                  <text textAnchor="middle" y={-10 / view.zoom} style={{ fontSize: 10 / view.zoom, fill: "#334155", fontWeight: 600, pointerEvents: "none" }}>
                    {getCountryName(p.code)}
                  </text>
                )}
              </Marker>
            )
          })}
        </ZoomableGroup>
      </ComposableMap>
    </div>
  )
}
