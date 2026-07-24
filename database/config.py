"""
설정 로더 - .env 파일에서 API 키와 DB 접속 정보를 읽어온다.
코드 어디에도 키를 직접 쓰지 않고 항상 여기서 os.getenv 로 가져온다.
"""
import os
from dotenv import load_dotenv

# 같은 폴더의 .env 파일을 읽어 환경변수로 로드
load_dotenv()

# ── API 키 ──────────────────────────────────────────────
CUSTOMS_API_KEY  = os.getenv("CUSTOMS_API_KEY")   # 관세청
COMTRADE_API_KEY = os.getenv("COMTRADE_API_KEY")  # UN Comtrade
FRED_API_KEY     = os.getenv("FRED_API_KEY")      # FRED
ECOS_API_KEY     = os.getenv("ECOS_API_KEY")      # 한국은행 ECOS

# ── DB 접속 정보 (.env 에서 덮어쓰기 가능) ────────────────
DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "port":     os.getenv("DB_PORT", "5432"),
    "dbname":   os.getenv("DB_NAME", "supplyguard"),
    "user":     os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", ""),
}


def check_keys():
    """키가 하나라도 비어있으면 알려준다."""
    missing = [k for k, v in {
        "CUSTOMS_API_KEY": CUSTOMS_API_KEY,
        "COMTRADE_API_KEY": COMTRADE_API_KEY,
        "FRED_API_KEY": FRED_API_KEY,
        "ECOS_API_KEY": ECOS_API_KEY,
    }.items() if not v]
    if missing:
        print(f"[경고] .env 에 다음 키가 비어있습니다: {missing}")
    else:
        print("[확인] API 키 4개 모두 로드됨")
    return not missing


if __name__ == "__main__":
    check_keys()
