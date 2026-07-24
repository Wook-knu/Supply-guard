# SupplyGuard 데이터 파이프라인

연합 학술제 13조 · 글로벌 공급망 위험 분석(SGRI) 서비스의 데이터 수집/적재 코드.

## 폴더 구조

```
supplyguard/
├─ config.py            # .env 에서 키·DB정보 로드
├─ db.py                # PostgreSQL 연결 & UPSERT 헬퍼
├─ main.py              # 전체 파이프라인 실행 진입점
├─ ingest/              # API별 수집 모듈 (호출→정제→적재)
│   ├─ customs.py       # 관세청 품목별 실적 (S)      [키 필요]
│   ├─ comtrade.py      # UN Comtrade 국가별 무역 (C)  [키 필요]
│   ├─ fred.py          # FRED 원자재가/환율 (V)       [키 필요]
│   ├─ ecos.py          # 한국은행 환율/물가 (V)       [키 필요]
│   ├─ worldbank_wgi.py # WGI 거버넌스 (P)            [키 불필요]
│   ├─ gdacs.py         # GDACS 재난경보 (L)          [키 불필요]
│   ├─ portwatch.py     # PortWatch 항만 (L)          [키 불필요]
│   ├─ gdelt.py         # GDELT 뉴스톤 (P 보조)       [키 불필요]
│   ├─ cbam.py          # EU CBAM 배출 (E)            [파일]
│   └─ lci.py           # 환경부 LCI (E)              [파일]
├─ requirements.txt
├─ .env.example         # 환경변수 템플릿 (커밋 OK)
└─ .gitignore           # .env 커밋 차단
```

## 설치 & 실행

```bash
# 1. 패키지 설치
pip install -r requirements.txt

# 2. 환경변수 설정: .env.example 을 복사해 .env 만들고 키 채우기
cp .env.example .env      # 그리고 .env 에 실제 키 입력

# 3. 키 로드 확인
python config.py

# 4. DB 스키마 + 기준표 생성 (최초 1회)
psql -d supplyguard -f supplyguard_schema_v2.sql
psql -d supplyguard -f seed_countries.sql
psql -d supplyguard -f seed_hs_codes.sql

# 5. API 데이터 적재
python main.py

# 6. 지표 계산 (6개 → SGRI 종합)
psql -d supplyguard -f calc_hhi_concentration.sql   # C
psql -d supplyguard -f calc_supply_instability.sql  # S
psql -d supplyguard -f calc_price_volatility.sql    # V
psql -d supplyguard -f calc_logistics_risk.sql      # L
psql -d supplyguard -f calc_policy_risk.sql         # P
psql -d supplyguard -f calc_esg_risk.sql            # E
psql -d supplyguard -f calc_sgri.sql                # 종합 SGRI
```

## 각 모듈 패턴

모든 수집 모듈은 동일한 3단계 구조를 따른다:

1. **fetch()** — API 호출해서 원본 응답을 dict 리스트로
2. **clean()** — 필드명 매핑·숫자 변환·결측 처리 (전처리)
3. **run()** — fetch → clean → `db.upsert()` 로 적재

## ⚠️ 보안

- **API 키는 `.env` 에만** 두고, 이 파일은 절대 git 에 올리지 않는다.
- 팀 공유는 GitHub 가 아니라 노션 비공개 페이지/공유드라이브로 `.env` 파일만 전달.
- 실수로 커밋했다면 즉시 키를 재발급(rotate)한다.

## TODO (팀 결정 필요)

- [ ] SGRI 산출 시간 단위 (월/분기)
- [ ] HS 코드 기준 자릿수 (2/4/6/10)
- [ ] 각 지표(S·C·V·L·P·E) 정규화 방법 (min-max / z-score)
- [ ] 6개 지표 가중치
- [ ] **국가 단위 지표(L·P) + 품목 단위 지표(S·C·V·E) 병합 규칙**
      → 현재 L·P는 hs_code=NULL 행, 나머지는 품목별 행에 저장됨.
        최종 SGRI 계산 시 country_code로 join해 (국가×품목) 한 행으로 합치는 규칙 필요.
- [ ] PortWatch FeatureServer URL, GDACS 엔드포인트 최종 확인
- [ ] CBAM/LCI 파일 다운로드 후 컬럼명 매핑 확정
