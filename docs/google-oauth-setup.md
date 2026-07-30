# 구글 로그인(OAuth) 설정 가이드

구글 로그인은 **Google Identity Services(ID 토큰)** 방식이다.
프론트의 구글 버튼이 ID 토큰을 받아 백엔드 `POST /auth/google` 로 보내면,
백엔드가 **구글 공개키로 검증**하고 우리 JWT 세션 토큰을 발급한다.

> ⚠️ OAuth 클라이언트 ID 발급은 **본인 Google 계정**으로 직접 해야 한다(자동화 불가).

---

## 1. Google Cloud Console 에서 OAuth 클라이언트 발급 (본인 작업)

1. https://console.cloud.google.com → 프로젝트 생성(또는 선택)
2. **APIs & Services → OAuth consent screen**
   - User Type: External → 앱 이름·이메일 입력 → 저장
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized JavaScript origins** 에 프론트 주소 추가:
     - 개발: `http://localhost:3000`
     - 배포: `https://<당신-프론트-도메인>` (예: `https://supplyguard.vercel.app`)
   - (ID 토큰 방식은 redirect URI 불필요)
4. 생성되면 **Client ID** 복사 (`xxxx.apps.googleusercontent.com`)

## 2. 환경변수 설정

- **백엔드**: `GOOGLE_CLIENT_ID=<복사한 Client ID>` , `SECRET_KEY=<랜덤 32바이트+>`
  - SECRET_KEY 생성: `python -c "import secrets;print(secrets.token_urlsafe(48))"`
  - 운영에선 `ALLOW_STUB_LOGIN=false` (이메일 스텁 비활성)
- **프론트**: `NEXT_PUBLIC_GOOGLE_CLIENT_ID=<같은 Client ID>` (버튼 렌더용)

## 3. 동작 확인
- 프론트 구글 버튼 클릭 → 구글 계정 선택 → 백엔드가 검증 후 로그인 완료
- 잘못된/만료 토큰 → 401, `GOOGLE_CLIENT_ID` 미설정 → 503

---

## 백엔드 (이미 구현됨)
- `POST /auth/google { id_token }` → 검증 후 사용자 조회/생성 → `{ access_token(JWT), user }`
- 세션 토큰은 서명된 JWT (위조 불가). `GET /auth/me` 로 사용자 확인.

## 프론트 (해야 할 일 — frontend-tasks.md 참고)
- Google Identity Services 스크립트 로드 + 로그인 버튼 렌더
- credential(ID 토큰) → `api.googleLogin(idToken)` → 반환된 access_token 저장
