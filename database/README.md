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

## S(수급 불안정성) 소스에 대하여 — 임시 대체 중

원래 계획: 관세청_품목별 수출입실적(15101609). **공공데이터포털 승인 대기로 사용 불가.**

임시 대체: **UN Comtrade 의 World(전세계 합계) 행**. 성격이 같다 — 둘 다 "한국이 이 품목을
월별로 얼마나 수입하는지"이고 국가 구분이 없다. Comtrade 는 키가 없으면 무료 preview
엔드포인트(호출당 500행, 일일 무제한)로 자동 전환되므로 키 없이도 바로 돌아간다.

```
comtrade.run_world()  →  comtrade_trade_flows (partner_code = NULL)
                              ↓
                      s_source_monthly  (뷰)
                              ↓
              calc_merge_item.sql / calc_supply_instability.sql
```

계산 SQL 은 소스 테이블을 직접 읽지 않고 **`s_source_monthly` 뷰만** 바라본다.
승인이 나면 `supplyguard_schema_v2.sql` [4] 섹션의 뷰 정의를 `customs_item_trade_stats`
기준으로 바꾸고 `main.py` 의 `customs.run()` 을 되살리면 끝이다. 계산 로직·가중치·SGRI·
테이블 구조는 바뀌지 않는다. (교체용 SQL 은 스키마 파일에 주석으로 적어둠)

### ⚠️ 소스를 섞지 말 것

Comtrade 는 UN 이 표준화한 값, 관세청은 CIF 신고값이라 같은 품목·같은 달인데 숫자가 다르다.
한 시계열에 두 소스를 섞으면 **변동계수(CV)가 실제보다 크게 나와 S 가 과대평가된다.**
소스를 교체할 때는 반드시 `score_s` 를 전 기간 재계산할 것.

### 한계

Comtrade 월별 데이터는 관세청보다 2~3개월 늦게 올라온다. 최신 월이 필요하면
관세청 [수출입무역통계](https://tradedata.go.kr) 에서 xlsx/json/csv 로 직접 받을 수 있다
(회원가입·승인 불필요).

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
