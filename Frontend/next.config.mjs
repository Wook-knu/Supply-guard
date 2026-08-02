/** @type {import('next').NextConfig} */
// Next.js 빌드 및 런타임 동작을 설정합니다. 현재는 기본 설정을 사용합니다.
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // 로컬 개발에서 원격 백엔드를 확인할 때 브라우저 CORS를 피하는 동일 출처 프록시입니다.
  // API_PROXY_TARGET을 지정한 경우에만 활성화되므로 Vercel 기본 배포에는 영향을 주지 않습니다.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET
    return target
      ? [{ source: "/api/backend/:path*", destination: `${target}/:path*` }]
      : []
  },
}

export default nextConfig
