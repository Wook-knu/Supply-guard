"""
앱 설정 로더.
.env 에서 DB 접속 정보를 읽어온다. database/config.py 와 같은 값을 바라본다.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── DB 접속 정보 ──
    DB_HOST: str = "localhost"
    DB_PORT: str = "5432"
    DB_NAME: str = "supplyguard"
    DB_USER: str = "postgres"
    DB_PASSWORD: str = ""

    # ── CORS ──
    FRONTEND_ORIGIN: str = "http://localhost:3000"

    # ── 인증(JWT + Google OAuth) ──
    SECRET_KEY: str = "dev-secret-change-in-production-min-32-bytes!"   # JWT 서명키(운영은 반드시 교체)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7        # 7일
    GOOGLE_CLIENT_ID: str = ""                            # 구글 OAuth 클라이언트 ID (없으면 구글로그인 비활성)
    ALLOW_STUB_LOGIN: bool = True                         # 이메일 스텁 로그인 허용(데모용, 운영은 False)

    @property
    def database_url(self) -> str:
        """SQLAlchemy 접속 URL (psycopg2 드라이버)."""
        return (
            f"postgresql+psycopg2://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )


settings = Settings()
