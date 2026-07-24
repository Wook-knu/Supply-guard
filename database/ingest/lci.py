"""
환경부 LCI DB(전과정 배출계수) 적재 - E(ESG·탄소규제) 요소.
API 아님 → 환경산업기술원 포털에서 배출계수 파일 다운로드 후 CSV 로 적재.

파일 컬럼 예상(실제 컬럼명에 맞게 조정):
  물질명(material), 배출계수(emission factor), 단위(unit)
출처: https://www.keiti.re.kr/ , https://ecosq.or.kr/
"""
import csv
from db import upsert


def load_csv(path: str) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            name = (r.get("물질명") or r.get("material") or r.get("material_name") or "").strip()
            if not name:
                continue
            rows.append({
                "material_name":   name,
                "hs_code":         (r.get("hs_code") or "").strip() or None,  # 매핑 있으면
                "emission_factor": _num(r.get("배출계수") or r.get("emission_factor")),
                "unit":            r.get("단위") or r.get("unit"),
                "source":          "환경부 LCI DB",
            })
    return rows


def _num(v):
    try:
        return float(str(v).replace(",", ""))
    except (ValueError, TypeError):
        return None


def run(path: str):
    rows = load_csv(path)
    # lci_emission_factors 엔 UNIQUE 제약 없음 → 재적재 시 기존 삭제 후 넣거나 제약 추가 권장
    if rows:
        from db import get_conn
        from psycopg2.extras import execute_values
        cols = list(rows[0].keys())
        vals = [[r.get(c) for c in cols] for r in rows]
        sql = f"INSERT INTO lci_emission_factors ({', '.join(cols)}) VALUES %s"
        with get_conn() as conn, conn.cursor() as cur:
            execute_values(cur, sql, vals)
            conn.commit()
        print(f"[lci_emission_factors] {len(rows)}행 적재")


if __name__ == "__main__":
    run("data/raw/lci_emission_factors.csv")
