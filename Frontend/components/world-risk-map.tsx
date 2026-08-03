"use client"

// 세계지도 — 선택 품목의 공급국을 SGRI 위험도 색으로 표시하고, 클릭하면 상위에서 상세를 연다.
// react-simple-maps 사용. 배경 지도는 world-atlas(topojson) CDN에서 로드.

import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps"
import { COUNTRY_COORDS } from "@/lib/country-coords"

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

export type RiskPoint = { code: string; sgri: number | null }

export function riskColor(sgri: number | null): string {
  if (sgri == null) return "#94a3b8"      // 데이터 없음 = 회색
  if (sgri >= 60) return "#ef4444"         // 높음 = 빨강
  if (sgri >= 35) return "#f59e0b"         // 주의 = 주황
  return "#10b981"                          // 안전 = 초록
}

export default function WorldRiskMap({ points, selected, onSelect }: {
  points: RiskPoint[]
  selected?: string | null
  onSelect?: (code: string) => void
}) {
  return (
    <div className="w-full">
      <ComposableMap projection="geoEqualEarth" projectionConfig={{ scale: 155 }} width={800} height={360} style={{ width: "100%", height: "auto" }}>
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#eef2f6"
                stroke="#dbe2ea"
                strokeWidth={0.4}
                style={{ default: { outline: "none" }, hover: { outline: "none", fill: "#e5eaf0" }, pressed: { outline: "none" } }}
              />
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
              {active && <circle r={12} fill={color} opacity={0.25} />}
              <circle r={active ? 7 : 5} fill={color} stroke="#fff" strokeWidth={1.5} style={{ cursor: "pointer" }} />
            </Marker>
          )
        })}
      </ComposableMap>
    </div>
  )
}
