"use client"

// 로그인 배경 지구본 — 정사영(구체) 투영. 자동 회전 + 드래그로 돌리기.
// 드래그하면 자동 회전이 잠시 멈췄다가 다시 돈다.

import { useEffect, useRef, useState } from "react"
import { ComposableMap, Geographies, Geography, Graticule, Sphere } from "react-simple-maps"

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

export default function LoginGlobe() {
  const [rot, setRot] = useState(20)      // 경도(좌우) 회전
  const [tilt, setTilt] = useState(-12)   // 위도(상하) 기울기
  const auto = useRef(true)
  const drag = useRef<{ x: number; y: number; rot: number; tilt: number } | null>(null)
  const resume = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (auto.current && !drag.current) setRot((r) => (r + 0.12) % 360)
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
    setTilt(Math.max(-80, Math.min(80, d.tilt - (e.clientY - d.y) * 0.3)))
  }
  const onUp = () => {
    drag.current = null
    resume.current = setTimeout(() => { auto.current = true }, 1200)
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center touch-none [cursor:grab] active:[cursor:grabbing]"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
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
      </ComposableMap>
    </div>
  )
}
