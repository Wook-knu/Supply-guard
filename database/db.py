"""
DB 연결 & 적재 헬퍼.
psycopg2 로 PostgreSQL 에 붙고, 딕셔너리 리스트를 받아 UPSERT 한다.
"""
import psycopg2
from psycopg2.extras import execute_values
from config import DB_CONFIG


def get_conn():
    """PostgreSQL 연결 객체 반환."""
    return psycopg2.connect(**DB_CONFIG)


def upsert(table: str, rows: list[dict], conflict_cols: list[str],
           conflict_where: str | None = None):
    """
    rows(딕셔너리 리스트)를 table 에 삽입한다.
    conflict_cols(UNIQUE 컬럼)가 겹치면 나머지 값을 갱신(UPSERT).

    예) upsert("customs_item_trade_stats", data, ["period", "hs_code"])

    conflict_where : 부분 유니크 인덱스를 쓸 때 그 인덱스의 WHERE 절을 그대로 넘긴다.
      NULL 이 낀 키는 기본 UNIQUE 로 ON CONFLICT 가 안 걸려서
      migrate_country_rows_unique.sql 처럼 부분 인덱스를 만들어 쓰는데,
      그 경우 INSERT 쪽에도 같은 WHERE 를 붙여야 인덱스가 매칭된다.

      예) upsert("comtrade_trade_flows", rows, [...], "partner_code IS NULL")
    """
    if not rows:
        print(f"[{table}] 적재할 행 없음")
        return

    cols = list(rows[0].keys())
    values = [[r.get(c) for c in cols] for r in rows]

    update_cols = [c for c in cols if c not in conflict_cols]
    set_clause = ", ".join(f"{c}=EXCLUDED.{c}" for c in update_cols)

    where_clause = f" WHERE {conflict_where}" if conflict_where else ""
    sql = (
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES %s "
        f"ON CONFLICT ({', '.join(conflict_cols)}){where_clause} "
        f"DO UPDATE SET {set_clause}"
    )

    with get_conn() as conn, conn.cursor() as cur:
        execute_values(cur, sql, values)
        conn.commit()
    print(f"[{table}] {len(rows)}행 적재 완료")
