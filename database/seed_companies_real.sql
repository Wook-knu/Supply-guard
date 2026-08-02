-- ============================================================================
-- 실 기업 시드 데이터 (배터리 소재: 리튬·코발트)
--   HS 283691(탄산리튬) / 282520(산화·수산화리튬) / 282200(코발트 산화·수산화물)
--
-- [데이터 출처 구분]
--   name / name_en / country_code / website / hs_codes / annual_capacity
--     → 기업 공시(DART, SEC EDGAR), 연차·지속가능경영보고서, USGS MCS 기반 실제 값
--   unit_price / available_quantity / lead_time_days /
--   on_time_delivery_rate / defect_rate_pct
--     → ★추정치★. 조달 단위 지표는 공개되지 않으므로 시장 시세·물류거리 기반 추정.
--       data_source 컬럼에 'manual:estimated' 로 표기하여 실데이터와 구분함.
--   certifications → 기업 홈페이지 공개 인증 기준(미확인 기업은 빈 배열)
--
-- 실행:
--   psql -U postgres -d supplyguard -f database/seed_hs_codes.sql
--   psql -U postgres -d supplyguard -f database/seed_hs_codes_battery.sql
--   psql -U postgres -d supplyguard -f database/migrate_companies_procurement.sql
--   psql -U postgres -d supplyguard -f database/seed_companies_real.sql
--
-- 재실행 안전: name 기준 NOT EXISTS + UPDATE
-- ============================================================================

INSERT INTO companies
    (name, name_en, country_code, company_type, website, hs_codes, certifications,
     annual_capacity, capacity_unit, status, data_source)
SELECT v.name, v.name_en, v.cc, 'supplier', v.web, v.hs::jsonb, v.certs::jsonb,
       v.cap, 'ton/year', 'active', 'manual:public-disclosure'
FROM (VALUES
    -- ── 리튬: 탄산리튬(283691) 및 수산화리튬(282520) 생산 ────────────────────
    ('SQM',                        'SQM S.A.',                              'CL', 'https://www.sqmlithium.com',   '["283691","282520"]', '["ISO 9001","ISO 14001","IATF 16949"]', 210000),
    ('Albemarle',                  'Albemarle Corporation',                 'US', 'https://www.albemarle.com',    '["283691","282520"]', '["ISO 9001","ISO 14001","ISO 45001"]',  225000),
    ('Arcadium Lithium',           'Arcadium Lithium plc',                  'US', 'https://www.arcadiumlithium.com','["283691","282520"]','["ISO 9001","ISO 14001"]',              75000),
    ('Ganfeng Lithium',            'Jiangxi Ganfeng Lithium Group',         'CN', 'https://www.ganfenglithium.com','["283691","282520"]','["ISO 9001","ISO 14001","IATF 16949"]', 220000),
    ('Tianqi Lithium',             'Tianqi Lithium Corporation',            'CN', 'https://www.tianqilithium.com','["283691","282520"]', '["ISO 9001","ISO 14001"]',              88000),
    ('Sichuan Yahua',              'Sichuan Yahua Industrial Group',        'CN', 'https://www.yahuagroup.com',   '["282520","283691"]', '["ISO 9001","IATF 16949"]',             73000),
    ('Chengxin Lithium',           'Sichuan Chengxin Lithium Group',        'CN', NULL,                           '["283691","282520"]', '["ISO 9001"]',                          70000),
    ('Zangge Mining',              'Zangge Mining Company',                 'CN', NULL,                           '["283691"]',          '[]',                                    12000),
    ('Qinghai Salt Lake Industry', 'Qinghai Salt Lake Industry Co.',        'CN', NULL,                           '["283691"]',          '["ISO 9001"]',                          40000),
    ('Pilbara Minerals',           'Pilbara Minerals Limited',              'AU', 'https://www.pilbaraminerals.com.au','["283691"]',      '["ISO 9001","ISO 14001"]',              85000),
    ('Mineral Resources',          'Mineral Resources Limited',             'AU', 'https://www.mineralresources.com.au','["283691"]',     '["ISO 9001"]',                          50000),
    ('IGO Limited',                'IGO Limited (Kwinana JV)',              'AU', 'https://www.igo.com.au',       '["282520"]',          '["ISO 9001","ISO 14001"]',              24000),
    ('POSCO Holdings',             'POSCO Holdings Inc.',                   'KR', 'https://www.posco.co.kr',      '["283691","282520"]', '["ISO 9001","ISO 14001","IATF 16949"]',  73000),
    ('POSCO Future M',             'POSCO FUTURE M Co., Ltd.',              'KR', 'https://www.poscofuturem.com', '["282520","282200"]', '["ISO 9001","ISO 14001","IATF 16949"]',  40000),
    ('Rio Tinto',                  'Rio Tinto plc (Rincon)',                'AR', 'https://www.riotinto.com',     '["283691"]',          '["ISO 9001","ISO 14001"]',               3000),
    ('Sigma Lithium',              'Sigma Lithium Corporation',             'BR', 'https://www.sigmalithiumresources.com','["283691"]',   '["ISO 9001"]',                          27000),
    ('Lithium Americas',           'Lithium Americas Corp.',                'CA', 'https://www.lithiumamericas.com','["283691"]',         '[]',                                    40000),
    ('Vulcan Energy Resources',    'Vulcan Energy Resources Limited',       'DE', 'https://v-er.eu',              '["282520"]',          '["ISO 14001"]',                         24000),
    ('Keliber',                    'Keliber Oy (Sibanye-Stillwater)',       'FI', 'https://www.keliber.fi',       '["282520"]',          '["ISO 9001","ISO 14001"]',              15000),
    ('Ganfeng Lithium Mexico',     'Bacanora Lithium (Ganfeng)',            'MX', NULL,                           '["283691"]',          '[]',                                    17500),

    -- ── 코발트: 코발트 산화물·수산화물(282200) ──────────────────────────────
    ('Glencore',                   'Glencore plc',                          'CH', 'https://www.glencore.com',     '["282200"]',          '["ISO 9001","ISO 14001","ISO 45001"]',  40000),
    ('CMOC Group',                 'CMOC Group Limited',                    'CN', 'https://www.cmoc.com',         '["282200"]',          '["ISO 9001","ISO 14001"]',             114000),
    ('Huayou Cobalt',              'Zhejiang Huayou Cobalt Co., Ltd.',      'CN', 'https://www.huayou.com',       '["282200"]',          '["ISO 9001","ISO 14001","IATF 16949"]',  40000),
    ('Jinchuan Group',             'Jinchuan Group International Resources','CN', 'https://www.jnmc.com',         '["282200"]',          '["ISO 9001","ISO 14001"]',              10000),
    ('GEM Co.',                    'GEM Co., Ltd.',                         'CN', 'https://www.gem.com.cn',      '["282200"]',          '["ISO 9001","ISO 14001"]',              20000),
    ('Umicore',                    'Umicore SA',                            'BE', 'https://www.umicore.com',      '["282200"]',          '["ISO 9001","ISO 14001","ISO 45001"]',  15000),
    ('Sumitomo Metal Mining',      'Sumitomo Metal Mining Co., Ltd.',       'JP', 'https://www.smm.co.jp',        '["282200"]',          '["ISO 9001","ISO 14001"]',               4000),
    ('Korea Zinc',                 'Korea Zinc Co., Ltd.',                  'KR', 'https://www.koreazinc.co.kr',  '["282200"]',          '["ISO 9001","ISO 14001","IATF 16949"]',   3000),
    ('Sherritt International',     'Sherritt International Corporation',    'CA', 'https://www.sherritt.com',     '["282200"]',          '["ISO 9001","ISO 14001"]',               3400),
    ('Vale',                       'Vale S.A.',                             'BR', 'https://www.vale.com',         '["282200"]',          '["ISO 9001","ISO 14001"]',               2000),
    ('ERG',                        'Eurasian Resources Group (Metalkol)',   'LU', 'https://www.eurasianresources.lu','["282200"]',       '["ISO 9001"]',                          20000),
    ('Managem',                    'Managem Group',                         'MA', 'https://www.managemgroup.com', '["282200"]',          '["ISO 9001","ISO 14001"]',               2300),
    ('Nornickel',                  'MMC Norilsk Nickel',                    'RU', 'https://www.nornickel.com',    '["282200"]',          '["ISO 9001"]',                           4000),
    ('Chemaf Resources',           'Chemaf Resources Limited',              'CD', 'https://www.chemaf.com',       '["282200"]',          '[]',                                    16000)
) AS v(name, name_en, cc, web, hs, certs, cap)
WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.name = v.name);


-- ============================================================================
-- 조달 지표 보강 — ★전부 추정치★ (공개 자료 없음)
--   unit_price: LCE/수산화리튬/코발트 각각의 최근 시장 시세대(USD/kg) ± 프리미엄
--   lead_time_days: 한국 기준 해상운송 소요 + 생산 리드타임 추정
--   on_time_delivery_rate / defect_rate_pct: 기업 규모·인증 보유 수준으로 추정
-- ※ 선행: migrate_companies_procurement.sql
-- ============================================================================
UPDATE companies SET data_source='manual:estimated' WHERE name IN (
  SELECT name FROM (VALUES ('SQM'),('Albemarle'),('Arcadium Lithium'),('Ganfeng Lithium'),
  ('Tianqi Lithium'),('Sichuan Yahua'),('Chengxin Lithium'),('Zangge Mining'),
  ('Qinghai Salt Lake Industry'),('Pilbara Minerals'),('Mineral Resources'),('IGO Limited'),
  ('POSCO Holdings'),('POSCO Future M'),('Rio Tinto'),('Sigma Lithium'),('Lithium Americas'),
  ('Vulcan Energy Resources'),('Keliber'),('Ganfeng Lithium Mexico'),('Glencore'),('CMOC Group'),
  ('Huayou Cobalt'),('Jinchuan Group'),('GEM Co.'),('Umicore'),('Sumitomo Metal Mining'),
  ('Korea Zinc'),('Sherritt International'),('Vale'),('ERG'),('Managem'),('Nornickel'),
  ('Chemaf Resources')) AS t(name));

UPDATE companies AS c SET
    unit_price            = v.price,
    available_quantity    = v.qty,
    lead_time_days        = v.lead,
    on_time_delivery_rate = v.otd,
    defect_rate_pct       = v.defect
FROM (VALUES
    -- 리튬계 (USD/kg 기준 추정)
    ('SQM',                        18.5,  180000,  28,  95.0, 0.8),
    ('Albemarle',                  19.8,  190000,  30,  96.0, 0.6),
    ('Arcadium Lithium',           19.2,   65000,  33,  94.0, 0.7),
    ('Ganfeng Lithium',            17.2,  200000,  22,  90.0, 1.2),
    ('Tianqi Lithium',             17.6,   80000,  23,  89.0, 1.3),
    ('Sichuan Yahua',              17.9,   66000,  24,  88.0, 1.4),
    ('Chengxin Lithium',           17.4,   62000,  24,  86.0, 1.6),
    ('Zangge Mining',              16.9,   10000,  26,  82.0, 2.2),
    ('Qinghai Salt Lake Industry', 16.5,   36000,  26,  83.0, 2.0),
    ('Pilbara Minerals',           20.1,   75000,  35,  97.0, 0.5),
    ('Mineral Resources',          20.4,   44000,  36,  93.0, 0.9),
    ('IGO Limited',                21.0,   21000,  34,  95.0, 0.6),
    ('POSCO Holdings',             19.0,   65000,   9,  97.0, 0.5),
    ('POSCO Future M',             19.6,   35000,   7,  98.0, 0.4),
    ('Rio Tinto',                  21.5,    2600,  45,  92.0, 0.8),
    ('Sigma Lithium',              20.8,   23000,  48,  87.0, 1.5),
    ('Lithium Americas',           21.2,   34000,  40,  85.0, 1.4),
    ('Vulcan Energy Resources',    23.0,   20000,  47,  90.0, 0.9),
    ('Keliber',                    22.4,   13000,  50,  91.0, 0.9),
    ('Ganfeng Lithium Mexico',     19.9,   15000,  42,  84.0, 1.7),
    -- 코발트계 (USD/kg 기준 추정)
    ('Glencore',                   33.0,   36000,  38,  96.0, 0.6),
    ('CMOC Group',                 28.5,  100000,  25,  90.0, 1.2),
    ('Huayou Cobalt',              29.4,   36000,  23,  92.0, 1.0),
    ('Jinchuan Group',             29.9,    9000,  24,  88.0, 1.4),
    ('GEM Co.',                    28.9,   18000,  24,  87.0, 1.5),
    ('Umicore',                    36.5,   13500,  44,  97.0, 0.4),
    ('Sumitomo Metal Mining',      35.8,    3600,  10,  98.0, 0.3),
    ('Korea Zinc',                 34.5,    2700,   5,  98.0, 0.3),
    ('Sherritt International',     33.8,    3000,  40,  91.0, 0.9),
    ('Vale',                       34.2,    1800,  46,  90.0, 1.0),
    ('ERG',                        30.2,   18000,  52,  82.0, 2.0),
    ('Managem',                    33.1,    2000,  43,  89.0, 1.1),
    ('Nornickel',                  31.0,    3600,  35,  80.0, 1.8),
    ('Chemaf Resources',           28.0,   14000,  55,  76.0, 2.6)
) AS v(name, price, qty, lead, otd, defect)
WHERE c.name = v.name;
