"""
EU CBAM 배출 기본값 적재 - E(ESG·탄소규제) 요소.
CBAM 은 API 가 아니라 EU 가 배포하는 '기본값(default values)' 파일(Excel/CSV).
→ EU 사이트에서 파일 다운로드 후 CSV 로 저장해 이 로더로 적재.

파일 컬럼 예상(다운로드 후 실제 컬럼명에 맞게 매핑 조정):
  CN code, product, direct emissions, indirect emissions
출처: https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/
      cbam-legislation-and-guidance_en
"""
import csv
from db import upsert


def load_csv(path: str, valid_year: int = 2024) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            cn = (r.get("CN code") or r.get("cn_code") or "").strip()
            if not cn:
                continue
            rows.append({
                "cn_code":        cn,
                "hs_code":        cn[:6] if len(cn) >= 6 else None,  # CN 앞6자리=HS6
                "product_name":   r.get("product") or r.get("product_name"),
                "direct_emission":  _num(r.get("direct emissions") or r.get("direct")),
                "indirect_emiss":   _num(r.get("indirect emissions") or r.get("indirect")),
                "unit":           "tCO2e/t",
                "valid_year":     valid_year,
            })
    return rows


def _num(v):
    try:
        return float(str(v).replace(",", ""))
    except (ValueError, TypeError):
        return None


def run(path: str, valid_year: int = 2024):
    rows = load_csv(path, valid_year)
    upsert("cbam_emission_defaults", rows, ["cn_code", "valid_year"])


if __name__ == "__main__":
    # 예시: 다운로드한 파일 경로
    run("data/raw/cbam_default_values.csv")
