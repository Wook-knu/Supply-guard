from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from .config import configured, load_project_env


load_project_env()

UPSTREAM_AUDITED_COMMIT = "3c7ad23d00a3d01d40f46f62ef3c573e1e7811fb"

DATA_SOURCES = [
    {
        "name": "관세청 품목별 수출입실적",
        "kind": "api_key",
        "env": "CUSTOMS_API_KEY",
        "sgri": ["S", "V"],
        "local_status": "integrated",
        "upstream_main": "conditional_all_four_keys",
    },
    {
        "name": "UN Comtrade Free API",
        "kind": "api_key",
        "env": "COMTRADE_API_KEY",
        "aliases": ["UN_COMTRADE_API_KEY"],
        "sgri": ["S", "C"],
        "local_status": "integrated",
        "upstream_main": "conditional_all_four_keys",
    },
    {
        "name": "FRED",
        "kind": "api_key_optional_for_local",
        "env": "FRED_API_KEY",
        "sgri": ["V"],
        "local_status": "integrated_public_csv_fallback",
        "upstream_main": "conditional_all_four_keys",
    },
    {
        "name": "한국은행 ECOS",
        "kind": "api_key",
        "env": "ECOS_API_KEY",
        "sgri": ["V"],
        "local_status": "integrated",
        "upstream_main": "conditional_all_four_keys",
    },
    {
        "name": "World Bank Indicators",
        "kind": "no_key",
        "env": None,
        "sgri": ["P", "L", "E"],
        "local_status": "integrated",
        "upstream_main": "enabled",
    },
    {
        "name": "GDACS",
        "kind": "no_key",
        "env": None,
        "sgri": ["L"],
        "local_status": "integrated",
        "upstream_main": "enabled_but_country_mapping_todo",
    },
    {
        "name": "GDELT",
        "kind": "no_key",
        "env": None,
        "sgri": ["S", "P", "L", "E"],
        "local_status": "integrated",
        "upstream_main": "commented_out",
    },
    {
        "name": "IMF PortWatch",
        "kind": "no_key",
        "env": None,
        "sgri": ["L"],
        "local_status": "integrated_verified_daily_ports_endpoint",
        "upstream_main": "commented_out_placeholder_endpoint",
    },
    {
        "name": "EU CBAM 기본값",
        "kind": "file",
        "env": "CBAM_DATA_PATH",
        "sgri": ["E"],
        "local_status": "file_ingestion_not_integrated",
        "upstream_main": "manual_file_step_commented_out",
    },
    {
        "name": "환경부 LCI DB",
        "kind": "file",
        "env": "LCI_DATA_PATH",
        "sgri": ["E"],
        "local_status": "file_ingestion_not_integrated",
        "upstream_main": "manual_file_step_commented_out",
    },
]


def audit_api_configuration() -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for source in DATA_SOURCES:
        env_name = source.get("env")
        aliases = source.get("aliases") or []
        configured_names = [
            name
            for name in ([env_name] if env_name else []) + aliases
            if name and configured(name)
        ]
        if source["kind"] == "no_key":
            credential_ready = True
        elif source["kind"] == "file":
            credential_ready = bool(
                configured_names
                and Path(os.environ[configured_names[0]]).expanduser().exists()
            )
        else:
            credential_ready = bool(configured_names)
        rows.append(
            {
                **source,
                "configured_names": configured_names,
                "credential_or_source_ready": credential_ready,
                "db_pipeline_active_now": (
                    source["upstream_main"] == "enabled"
                    and credential_ready
                ),
            }
        )

    api_rows = [row for row in rows if row["kind"] != "file"]
    missing_api_configuration = [
        row["name"]
        for row in api_rows
        if not row["credential_or_source_ready"]
    ]
    return {
        "title": "SupplyGuard 외부 데이터/API 감사",
        "upstream_audited_commit": UPSTREAM_AUDITED_COMMIT,
        "all_local_api_clients_implemented": all(
            str(row["local_status"]).startswith("integrated")
            for row in api_rows
        ),
        "all_api_access_ready": all(
            row["credential_or_source_ready"] for row in api_rows
        ),
        "missing_api_configuration": missing_api_configuration,
        "all_database_sources_active_in_upstream_main": all(
            row["db_pipeline_active_now"] for row in rows
        ),
        "important_findings": [
            (
                "upstream main.py는 키 4개가 모두 있어야 관세청·Comtrade·"
                "FRED·ECOS를 함께 실행하므로 부분 키 실행이 불가능합니다."
            ),
            "GDELT와 PortWatch는 upstream main.py에서 주석 처리되어 있습니다.",
            (
                "PortWatch upstream URL은 placeholder지만 이 구현은 IMF가 공개한 "
                "Daily Ports ArcGIS 엔드포인트를 기본값으로 연결했습니다."
            ),
            "CBAM과 LCI는 API가 아니라 파일 적재 방식이며 현재 자동 실행되지 않습니다.",
            "Gemini API는 가중치·기업 추천·보고서 초안에 사용하며 점수 계산은 Python이 수행합니다.",
        ],
        "sources": rows,
        "gemini_usage": {
            "env": "GEMINI_API_KEY",
            "configured": configured("GEMINI_API_KEY"),
            "model": "gemini-3.6-flash",
            "role": "bounded weights, company recommendations, and report drafts",
            "used_for_weight_proposal": True,
            "score_calculated_by": "python_formula",
        },
    }


def main() -> int:
    json.dump(audit_api_configuration(), sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
