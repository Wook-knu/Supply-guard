"""
적재 파이프라인 진입점.
각 API 클라이언트를 순서대로 실행한다.
사용법:
  python config.py        # 키 로드 확인
  python main.py          # 전체 실행 (예시 파라미터)
개별 실행:
  python -m ingest.customs      # 관세청 (키 필요)
  python -m ingest.comtrade     # Comtrade (키 필요)
  python -m ingest.fred         # FRED (키 필요)
  python -m ingest.ecos         # ECOS (키 필요)
  python -m ingest.worldbank_wgi  # WGI (키 불필요)
  python -m ingest.gdacs          # GDACS (키 불필요)
  python -m ingest.portwatch      # PortWatch (키 불필요, 엔드포인트 확인 필요)
  python -m ingest.gdelt          # GDELT (키 불필요)
  # cbam / lci 는 파일 다운로드 후 경로 지정해 실행
"""
from config import check_keys
from ingest import (customs, comtrade, fred, ecos,
                    worldbank_wgi, gdacs, portwatch, gdelt)


def main():
    # ── S(수급 불안정성) : 관세청 승인 대기 → Comtrade World 합계로 대체 ──
    #   Comtrade 는 키가 없으면 무료 preview 엔드포인트로 자동 전환되므로
    #   키 확인(check_keys) 앞에서 먼저 실행한다.
    print("\n[Comtrade] 월별 World 합계 (S 대체 소스)")
    for rng in (("202401", "202412"), ("202501", "202512")):
        comtrade.run_world("410", comtrade.months(*rng), "283691", "M")

    # ── 키 필요 소스 (C·V) ───────────────────────────────
    if not check_keys():
        print("키가 비어있어 키 필요 소스는 건너뜁니다.")
    else:
        # 관세청 승인이 나면 아래를 되살리고, 스키마의 s_source_monthly 뷰도
        # customs_item_trade_stats 기준으로 교체할 것 (교체용 SQL 은 스키마 [4] 섹션 참고)
        print("\n[관세청] 품목별 실적")
        try:
            customs.run("283691", "202401", "202512")
        except Exception as e:  # data.go.kr 활용신청 미승인 시 403 → 건너뜀
            print(f"  관세청 건너뜀(키/활용신청 확인 필요): {e}")
        print("\n[Comtrade] 국가별 무역 (C 집중도용)")
        for yr in ("2019", "2020", "2021", "2022", "2023"):
            comtrade.run("410", yr, "283691", "M")   # 리튬 탄산염(HS 283691)
        print("\n[FRED] 원자재가격지수")
        fred.run("PALLFNFINDEXM")
        print("\n[ECOS] 환율")
        ecos.run("731Y001", "0000001", "D", "20240101", "20241231")  # 원/달러 일별

    # ── 키 불필요 소스 (P·L) ─────────────────────────────
    print("\n[WGI] 거버넌스 지표")
    worldbank_wgi.run()
    print("\n[GDACS] 재난 경보")
    gdacs.run()
    print("\n[PortWatch] 항만")
    portwatch.run()   # 엔드포인트 확정됨 (Daily_Ports_Data)
    # print("\n[GDELT] 뉴스 톤"); gdelt.run("CN", "CH", "trade")

    # ── E(탄소) 는 파일 다운로드 후 별도 실행 ──────────────
    # from ingest import cbam, lci
    # cbam.run("data/raw/cbam_default_values.csv")
    # lci.run("data/raw/lci_emission_factors.csv")

    print("\n완료.")


if __name__ == "__main__":
    main()
