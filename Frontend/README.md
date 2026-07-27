# SupplyGuard Frontend

AI 기반 공급망 리스크 예측과 대체 공급처 의사결정을 돕는 프론트엔드 MVP입니다.

## 실행

```bash
npm install
npm run dev
```

로컬 주소: `http://localhost:3000`

## 화면 흐름

1. `/login` — 로그인 및 기업 초기 설정
2. `/dashboard` — 공급망 리스크 대시보드
3. `/items/new` — 모니터링 품목 등록
4. `/risks/lithium-carbonate` — 품목별 리스크 상세
5. `/recommendations` — 대체 국가·공급사 추천
6. `/suppliers/pilbara-minerals` — 공급사 공개 정보 및 검토 항목
7. `/reports/new` → `/reports/july-lithium-risk` — AI 보고서 생성·공유
8. `/alerts` — 공급망 경보 확인
9. `/settings` — 기업, 품목, 팀 수신자, 알림 기준 관리

## 팀 개발 규칙

- 화면 데이터는 현재 데모용 정적 데이터입니다. API 연동 시 각 페이지의 배열·상태값을 API 호출로 교체합니다.
- UI 공통 요소는 `components/ui/`에 있습니다.
- 개발 서버와 `next build`는 동시에 실행하지 않습니다. 빌드 검증 후에는 `.next` 캐시를 삭제하고 개발 서버를 다시 실행합니다.
