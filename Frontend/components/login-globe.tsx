"use client"

// 로그인 배경 지구본 — 정사영(구체) 투영. 자동 회전 + 드래그로 360도 돌리기.
// 지구본 위에 공급망(한국 허브 → 주요 공급국 경로선 + 펄스 마커)을 표시.
// 지구 뒷면 점/선은 감춰서(전면 반구만) 깔끔하게 보이게 한다.

import { useEffect, useRef, useState } from "react"
import { ComposableMap, Geographies, Geography, Graticule, Line, Marker, Sphere } from "react-simple-maps"
import { COUNTRY_COORDS } from "@/lib/country-coords"

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
const HUB = COUNTRY_COORDS.KR
// 주요 공급국(데모용) — 실데이터와 무관한 배경 연출
const NODES = ["CN", "JP", "VN", "IN", "AU", "DE", "US", "CL", "BR", "ZA", "SA", "FR"]
  .map((c) => COUNTRY_COORDS[c]).filter(Boolean) as [number, number][]

const RAD = Math.PI / 180
// 정사영 전면 반구에 보이는 점인지(투영 중심 기준 각거리 < 90도)
function visible([lng, lat]: [number, number], cLng: number, cLat: number): boolean {
  const cos = Math.sin(lat * RAD) * Math.sin(cLat * RAD) +
    Math.cos(lat * RAD) * Math.cos(cLat * RAD) * Math.cos((lng - cLng) * RAD)
  return cos > 0.09  // 약 85도 이내만 표시(가장자리 노이즈 제거)
}

export default function LoginGlobe() {
  const [rot, setRot] = useState(120)     // 경도(좌우) 회전 — 시작 시 아시아가 보이게
  const [tilt, setTilt] = useState(-12)   // 위도(상하) 기울기
  const auto = useRef(true)
  const drag = useRef<{ x: number; y: number; rot: number; tilt: number } | null>(null)
  const resume = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (auto.current && !drag.current) setRot((r) => (r + 0.1) % 360)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const onDown = (e: React.PointerEvent) => {
    if (resume.current) clearTimeout(resume.current)
    auto.current = false
    drag.current = { x: e.clientX, y: e.clientY, rot, tilt }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    setRot(d.rot + (e.clientX - d.x) * 0.4)
    setTilt(d.tilt - (e.clientY - d.y) * 0.3)
  }
  const onUp = () => {
    drag.current = null
    resume.current = setTimeout(() => { auto.current = true }, 1200)
  }

  // 투영 중심(보이는 반구의 중앙) 좌표
  const cLng = rot, cLat = tilt
  const hubVisible = visible(HUB, cLng, cLat)

  return (
    <div className="absolute inset-0 flex items-center justify-center touch-none [cursor:grab] active:[cursor:grabbing]"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
      <style>{`.lg-route{animation:lgdash 1.2s linear infinite}@keyframes lgdash{to{stroke-dashoffset:-16}}`}</style>
      {/* 은은한 후광 */}
      <div className="pointer-events-none absolute h-[120%] w-[120%] rounded-full bg-white/10 blur-3xl" />
      <ComposableMap
        projection="geoOrthographic"
        projectionConfig={{ rotate: [-rot, -tilt, 0], scale: 300 }}
        width={760} height={760}
        style={{ width: "min(115%, 760px)", height: "auto" }}
      >
        <Sphere id="ocean" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" strokeWidth={0.7} />
        <Graticule stroke="rgba(255,255,255,0.14)" strokeWidth={0.5} />
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography key={geo.rsmKey} geography={geo}
                fill="rgba(255,255,255,0.9)" stroke="rgba(14,116,144,0.35)" strokeWidth={0.3}
                style={{ default: { outline: "none" }, hover: { outline: "none", fill: "#a5f3fc" }, pressed: { outline: "none" } }} />
            ))
          }
        </Geographies>

        {/* 공급망 경로선 (허브·상대국 모두 전면일 때만) */}
        {NODES.map((to, i) => (hubVisible && visible(to, cLng, cLat)) ? (
          <Line key={`r-${i}`} from={HUB} to={to} stroke="#fde68a" strokeWidth={1.1}
            strokeLinecap="round" strokeDasharray="1 5" opacity={0.75} className="lg-route" />
        ) : null)}

        {/* 공급국 펄스 마커 */}
        {NODES.map((c, i) => visible(c, cLng, cLat) ? (
          <Marker key={`m-${i}`} coordinates={c}>
            <circle r={2.6} fill="#fbbf24">
              <animate attributeName="r" values="2.6;7;7" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.5;0;0" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle r={2.6} fill="#fbbf24" stroke="#fff" strokeWidth={1} />
          </Marker>
        ) : null)}

        {/* 한국 허브 핀 */}
        {hubVisible && (
          <Marker coordinates={HUB}>
            <circle r={4.2} fill="#2563eb" stroke="#fff" strokeWidth={1.6} />
            <circle r={1.6} fill="#fff" />
          </Marker>
        )}
      </ComposableMap>
    </div>
  )
}
