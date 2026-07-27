# 개발 환경 기준

모든 팀원은 아래 환경을 사용합니다.

| 항목 | 기준 |
| --- | --- |
| Node.js | 24.18.0 |
| npm | 11 이상 |
| 프레임워크 | Next.js 15.5.22 |
| 패키지 관리자 | npm (`package-lock.json` 사용) |

## 처음 실행하기

```bash
nvm use
npm ci
npm run dev
```

`npm install` 대신 `npm ci`를 사용하면 `package-lock.json` 기준으로 동일한 의존성이 설치됩니다.

## 검증

```bash
npm run build
```

개발 서버와 빌드는 같은 `.next` 캐시를 사용합니다. 빌드 검증 전에는 개발 서버를 종료하고, 검증 뒤에는 `.next`를 삭제한 다음 `npm run dev`로 다시 실행합니다.
