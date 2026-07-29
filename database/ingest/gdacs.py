"""
GDACS(전세계 재난 경보) 적재 - L(물류 리스크) 요소.
키 불필요.
호출 → 정제 → gdacs_alerts 테이블 UPSERT.

엔드포인트(확인 필요, 둘 중 택1):
  JSON: https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP
  RSS : https://www.gdacs.org/xml/rss.xml
아래는 GeoJSON(FeatureCollection) 응답 기준.
  features[].properties: eventid, episodeid, eventtype, alertlevel,
                         episodealertscore, country, fromdate, todate, severitydata
"""
import requests
from db import upsert

URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP"

TYPE_KO = {"EQ": "지진", "TC": "태풍", "FL": "홍수",
           "DR": "가뭄", "VO": "화산", "WF": "산불"}


def fetch() -> list[dict]:
    resp = requests.get(URL, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    return data.get("features", [])


def clean(raw: list[dict]) -> list[dict]:
    """GeoJSON feature → gdacs_alerts 컬럼 매핑. country_code(ISO2)는 후속 매핑."""
    rows = []
    for f in raw:
        p = f.get("properties", {})
        geom = f.get("geometry", {}) or {}
        coords = geom.get("coordinates") or [None, None]
        et = p.get("eventtype")
        rows.append({
            "event_id":        str(p.get("eventid")),
            "episode_id":      str(p.get("episodeid")) if p.get("episodeid") else None,
            "event_type":      et,
            "event_type_desc": TYPE_KO.get(et, et),
            "alert_level":     p.get("alertlevel"),
            "alert_score":     p.get("episodealertscore") or p.get("alertscore"),
            "country_code":    None,                       # country명 → ISO2 매핑 필요
            "country_name":    p.get("country"),
            "severity":        (p.get("severitydata") or {}).get("severitytext"),
            "from_date":       (p.get("fromdate") or "")[:10] or None,
            "to_date":         (p.get("todate") or "")[:10] or None,
            "longitude":       coords[0],
            "latitude":        coords[1],
        })
    return rows


def _map_country(rows: list[dict]) -> list[dict]:
    """country_name(영문) → countries.name_en 조인으로 country_code(ISO2) 채움.
    지역 표현('Kermadec Islands Region' 등) 매핑 실패 행은 country_code=None 유지."""
    from db import get_conn
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT lower(name_en), country_code FROM countries")
        m = dict(cur.fetchall())
    for r in rows:
        name = (r.get("country_name") or "").strip().lower()
        r["country_code"] = m.get(name)
    return rows


def run():
    raw = fetch()
    rows = clean(raw)
    rows = _map_country(rows)  # country_name → country_code 매핑
    upsert("gdacs_alerts", rows, ["event_id", "episode_id"])


if __name__ == "__main__":
    run()
