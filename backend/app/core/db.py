"""
DB 세션 관리.
- engine : PostgreSQL 커넥션 풀
- SessionLocal : 요청마다 하나씩 여는 세션 팩토리
- Base : ORM 모델의 부모 클래스
- get_db : FastAPI 의존성(Depends)으로 세션을 주입하고, 끝나면 닫는다
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True, echo=False)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """모든 ORM 모델이 상속하는 베이스."""
    pass


def get_db():
    """요청 단위 DB 세션. 라우터에서 Depends(get_db)로 사용."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
