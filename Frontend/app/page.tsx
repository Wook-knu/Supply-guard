import { redirect } from "next/navigation"

// 루트 주소로 접근하면 데모의 시작점인 로그인 화면으로 이동합니다.
// 인증 백엔드 연결 후에는 세션 유무에 따라 로그인 또는 대시보드로 분기할 수 있습니다.
export default function Home() {
  redirect("/login")
}
