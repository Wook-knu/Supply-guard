import type { Metadata } from 'next'

// 모든 페이지에 공통 적용되는 최상위 레이아웃입니다.
// 사이트 메타데이터, 아이콘, 전역 스타일과 운영 환경 분석 도구를 설정합니다.
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SupplyGuard | 공급망 리스크 관리',
  description: 'AI 기반 공급망 리스크 예측 및 대체 공급처 의사결정 도우미',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
