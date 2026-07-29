"""
IMF PortWatch(항만 물동량/혼잡) 적재 - L(물류 리스크) 요소.
키 불필요. ArcGIS FeatureServer 쿼리(JSON).
호출 → 정제 → portwatch_port_activity 테이블 UPSERT.

엔드포인트(확인 필요): PortWatch 는 ArcGIS Hub 로 데이터를 제공.
  {FEATURESERVER}/query?where=1=1&outFields=*&f=json&resultOffset=..
  (portwatch.imf.org 데이터셋 페이지에서 FeatureServer URL 확인 후 교체)
응답(JSON): features[].attributes = {portid, portname, ISO3, date,
             import_volume, export_volume, portcalls, ...}
"""
import requests
from db import upsert

# IMF PortWatch 일별 항만 데이터 (ArcGIS FeatureServer, 키 불필요)
FEATURESERVER = ("https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/"
                 "services/Daily_Ports_Data/FeatureServer/0/query")


def fetch(offset: int = 0, limit: int = 1000) -> list[dict]:
    # maxRecordCount=1000. 이 레이어는 orderByFields 미지원이라 정렬 없이 스냅샷을 가져온다.
    params = {"where": "1=1", "outFields": "*", "f": "json",
              "resultOffset": offset, "resultRecordCount": limit}
    resp = requests.get(FEATURESERVER, params=params, timeout=60)
    resp.raise_for_status()
    return resp.json().get("features", [])


def clean(raw: list[dict]) -> list[dict]:
    """attributes → portwatch_port_activity 컬럼 매핑. ISO3 → ISO2 후속 매핑."""
    rows = []
    for f in raw:
        a = f.get("attributes", {})
        rows.append({
            "port_id":       str(a.get("portid")),
            "port_name":     a.get("portname"),
            "country_code":  None,                     # ISO3 → ISO2 매핑(아래 _map_iso3)
            "iso3_tmp":      a.get("ISO3"),            # 매핑용 임시
            "obs_date":      _to_date(a.get("date")),
            "import_volume": a.get("import_volume") or a.get("import"),
            "export_volume": a.get("export_volume") or a.get("export"),
            "port_calls":    a.get("portcalls"),
            "latitude":      a.get("lat"),
            "longitude":     a.get("lon"),
        })
    return rows


def _to_date(v):
    """ArcGIS epoch(ms) 또는 문자열 → YYYY-MM-DD."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        import datetime as dt
        return dt.datetime.utcfromtimestamp(v / 1000).date().isoformat()
    return str(v)[:10]


def _map_iso3(rows: list[dict]) -> list[dict]:
    """ISO3 → countries.country_code(ISO2) 매핑. 매핑 실패해도 행은 유지(country_code=None)."""
    from db import get_conn
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT iso3, country_code FROM countries WHERE iso3 IS NOT NULL")
        m = dict(cur.fetchall())
    for r in rows:
        r["country_code"] = m.get(r.pop("iso3_tmp"))
    return rows


def run():
    raw = fetch()
    rows = clean(raw)
    rows = _map_iso3(rows)  # ISO3 → country_code
    upsert("portwatch_port_activity", rows, ["port_id", "obs_date"])


if __name__ == "__main__":
    run()
