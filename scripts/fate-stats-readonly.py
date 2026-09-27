#!/usr/bin/env python3
"""SSH forced command: expose only aggregate stats for one date, never a shell."""
import datetime
import json
import os
from pathlib import Path
import re
import sys
import urllib.request


def report_date(command):
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", command):
        raise ValueError("Expected YYYY-MM-DD")
    return datetime.date.fromisoformat(command).isoformat()


def main():
    try:
        date = report_date(os.environ.get("SSH_ORIGINAL_COMMAND", ""))
        env = dict(line.split("=", 1) for line in Path("/data/app/fate/.env.local").read_text().splitlines() if "=" in line and not line.startswith("#"))
        request = urllib.request.Request(
            "http://127.0.0.1:3100/fate/api/admin/stats?date=" + date,
            headers={"Authorization": "Bearer " + env["ADMIN_API_TOKEN"].strip().strip("\"'")},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
        if result.get("period", {}).get("date") != date:
            raise ValueError("Unexpected report period")
        usage_request = urllib.request.Request(
            "http://127.0.0.1:3100/fate/api/admin/metrics?date=" + date,
            headers={"Authorization": request.get_header("Authorization")},
        )
        try:
            with urllib.request.urlopen(usage_request, timeout=30) as response:
                usage = json.load(response)
            if usage.get("date") != date:
                raise ValueError("Unexpected usage period")
            result["usage"] = usage
        except Exception:
            result["usage"] = {"unavailable": True}
        print(json.dumps(result, ensure_ascii=False))
    except Exception:
        print("Daily statistics unavailable", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
