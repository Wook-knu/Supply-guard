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

# 데이터셋 페이지에서 실제 FeatureServer URL 확인 후 교체
FEATURESERVER = "https://services9.arcgis.com/<org>/arcgis/rest/services/" \
                "PortWatch_daily/FeatureServer/0/query"


def fetch(offset: int = 0, limit: int = 2000) -> list[dict]:
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
            "country_code":  None,                     # ISO3 → ISO2 매핑 필요
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


def run():
    raw = fetch()
    rows = clean(raw)
    # TODO: ISO3 → country_code 매핑 (worldbank_wgi._map_iso3 참고)
    upsert("portwatch_port_activity", rows, ["port_id", "obs_date"])


if __name__ == "__main__":
    run()
