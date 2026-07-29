from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .company_model import analyze_procurement
from .db_weighting import DatabaseWeightingError


def main(argv: list[str] | None = None) -> int:
    _configure_utf8_console()
    parser = argparse.ArgumentParser(
        description="SupplyGuard 조달 위험·기업 추천·보고서 초안 모델"
    )
    parser.add_argument("request_json", type=Path, nargs="?")
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="조달 정보를 터미널에서 입력",
    )
    parser.add_argument(
        "--company-data",
        type=Path,
        help="백엔드가 수집한 기업 후보 JSON 배열",
    )
    parser.add_argument(
        "--company-db",
        action="store_true",
        help="PostgreSQL supplier_company_candidates에서 후보 조회",
    )
    parser.add_argument("--dsn", help="--company-db용 PostgreSQL DSN")
    parser.add_argument(
        "--live-apis",
        action="store_true",
        help="설정된 외부 위험 데이터 API 호출",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("company_model_result.json"),
        help="결과 JSON 경로",
    )
    args = parser.parse_args(argv)

    try:
        payload = (
            _prompt_payload()
            if args.interactive or not args.request_json
            else json.loads(args.request_json.read_text(encoding="utf-8"))
        )
        candidates = _load_company_data(args.company_data)
        result = analyze_procurement(
            payload,
            candidate_companies=candidates,
            load_company_database=args.company_db,
            dsn=args.dsn,
            use_live_apis=args.live_apis,
        )
    except (
        OSError,
        json.JSONDecodeError,
        ValueError,
        DatabaseWeightingError,
    ) as exc:
        print(f"\n입력 또는 실행 오류: {exc}", file=sys.stderr)
        return 2

    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    _print_summary(result)
    print(f"\n전체 JSON 결과: {args.output.resolve()}")
    return 0


def _configure_utf8_console() -> None:
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


def _ask(label: str) -> str:
    return input(f"{label}: ").strip()


def _number(label: str) -> float:
    value = _ask(label)
    try:
        return float(value)
    except ValueError as exc:
        raise ValueError(f"{label}은(는) 단위·쉼표 없이 숫자로 입력하세요.") from exc


def _integer(label: str) -> int:
    value = _ask(label)
    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(
            f"{label}은(는) 소수점·통화기호·쉼표 없이 정수로 입력하세요."
        ) from exc


def _prompt_payload() -> dict[str, Any]:
    print("\n=== 조달 요청 정보 입력 ===")
    print("HS코드: 2·4·6·10자리 숫자(점·하이픈·공백은 자동 제거)")
    print("납기일: 오늘 이후 날짜를 YYYY-MM-DD로 입력\n")
    return {
        "procurement": {
            "hs_code": _ask("HS코드"),
            "item_name": _ask("품목명"),
            "quantity": _number("수량"),
            "target_price": _integer("실제 단가"),
            "delivery_date": _ask("납기일(YYYY-MM-DD)"),
            "quality_certification": _ask("품질/인증 기준(없으면 '없음')"),
        }
    }


def _load_company_data(path: Path | None) -> list[dict[str, Any]] | None:
    if path is None:
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("기업 후보 파일의 최상위 값은 JSON 배열이어야 합니다.")
    return data


def _print_summary(payload: dict[str, Any]) -> None:
    procurement = payload["procurement"]
    risk = payload["risk_assessment"]
    print("\n=== 분석 결과 ===")
    print(
        f"품목: {procurement['item_name']} | HS {procurement['hs_code']} | "
        f"수량 {procurement['quantity']:g}"
    )
    print(
        f"종합 SGRI: {risk['score']:.1f}/100 | "
        f"위험 수준: {risk['level_ko']} | 신뢰도: {risk['confidence']:.1f}%"
    )
    weights = risk["weight_profile"]
    if weights["uses_llm"]:
        source = f"Gemini 적용({weights['llm']['model']})"
    elif weights["strategy"] == "llm":
        source = "Gemini 미설정/실패 → 신뢰도 기반 가중치"
    else:
        source = weights["strategy"]
    print(f"가중치: {source}")
    print(f"가중치 설정 요약: {weights['summary']}")

    print("\n[가중치 설정 근거]")
    for item in risk["components"]:
        print(
            f"- {item['label']}({item['key']}): "
            f"{item['weight_percent']:.1f}% | {item['weight_reason']}"
        )

    print("\n[항목별 위험 점수]")
    for item in risk["components"]:
        print(
            f"- {item['label']}({item['key']}): {item['score']:.1f}점 "
            f"/ 가중치 {item['weight_percent']:.1f}%"
        )

    companies = payload["company_recommendations"]
    print("\n[추천 기업]")
    if not companies["recommendations"]:
        print(f"- {companies['summary']}")
    for company in companies["recommendations"]:
        print(
            f"{company['rank']}. {company['company_name']} "
            f"({company.get('country') or '국가 미확인'}) "
            f"| 적합도 {company['match_score']:.1f}"
        )
        print(f"   근거: {company['rationale']}")
        for evidence in company["evidence"]:
            print(f"   - {evidence['label']}: {evidence['value']}")

    report = payload["report_draft"]
    print(f"\n[보고서 초안] {report['title']}")
    for section in report["sections"]:
        print(f"\n{section['title']}\n{section['body']}")
    print("\n※ 자동 생성 초안이므로 계약 전 담당자 검토가 필요합니다.")


if __name__ == "__main__":
    raise SystemExit(main())
