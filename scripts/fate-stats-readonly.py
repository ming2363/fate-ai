#!/usr/bin/env python3
"""SSH forced command: expose only aggregate stats for one date, never a shell."""
import datetime
import html
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


def render_email(result):
    """Render recorded facts only; absent telemetry is one note, never empty tables."""
    date = report_date(result["period"]["date"])
    totals = result["totals"]
    for key in ("visits", "histories", "readingCalls", "uniqueVisitIps"):
        if sum(int(row.get(key, 0)) for row in result["regions"]) != int(totals[key]):
            raise ValueError("Regional totals mismatch")
    def escape(value):
        return html.escape(str(value if value is not None else "未记录"))
    def table(headings, rows):
        return '<table style="border-collapse:collapse;width:100%;margin:12px 0"><tr>' + ''.join('<th style="text-align:left;padding:8px;border-bottom:1px solid #ccc">' + escape(h) + '</th>' for h in headings) + '</tr>' + ''.join('<tr>' + ''.join('<td style="padding:8px;border-bottom:1px solid #eee">' + escape(v) + '</td>' for v in row) + '</tr>' for row in rows) + '</table>'
    parts = ['<div style="max-width:720px;margin:auto;font-family:Arial,sans-serif;line-height:1.7;color:#292923"><h1 style="color:#a33f2c">知命访问日报</h1><p>' + escape(date) + ' · 北京时间 00:00 至次日 00:00</p>']
    parts.append(table(["统计项", "数量"], [["页面访问", totals["visits"]], ["独立访问 IP", totals["uniqueVisitIps"]], ["算命历史", totals["histories"]], ["解读请求", totals["readingCalls"]]]))
    parts.append('<h2>城市与地区</h2>' + table(["网络出口地区", "访问", "算命历史", "解读请求"], [[' · '.join(dict.fromkeys(v for v in [r.get("country"), r.get("province"), r.get("city")] if v)) or '未知', r["visits"], r["histories"], r["readingCalls"]] for r in result["regions"]]))
    device_rows, unavailable = [], []
    for field, label in {"device": "设备类型", "os": "系统", "browser": "浏览器", "model": "手机型号", "referrerOrigin": "来源站点", "source": "推广来源", "campaign": "推广活动"}.items():
        rows = result.get("audience", {}).get(field, [])
        known = [r for r in rows if r.get("name") not in (None, "", "unknown", "null")]
        if not known:
            unavailable.append(label)
            continue
        device_rows.extend([[label, r["name"], r["visits"], r["reports"]] for r in known[:5]])
        unknown = [r for r in rows if r not in known]
        if unknown:
            device_rows.append([label, "未采集/浏览器未提供", sum(int(r["visits"]) for r in unknown), sum(int(r["reports"]) for r in unknown)])
    parts.append('<h2>设备与来源</h2>')
    if device_rows:
        parts.append(table(["维度", "名称（前五项）", "访问", "创建报告"], device_rows))
    if unavailable:
        parts.append('<p>' + escape('、'.join(unavailable)) + '：该日没有可识别数据。旧日志未采集的字段无法补出；浏览器也可能不提供具体机型。</p>')
    usage = result.get("usage")
    parts.append('<h2>模型用量与费用</h2>')
    if not usage or usage.get("unavailable"):
        parts.append('<p>模型统计接口暂不可用，请求数、token 和费用尚不能核验，未按 0 处理。</p>')
    else:
        if usage.get("date") != date:
            raise ValueError("Usage date mismatch")
        costs = usage.get("costs", [])
        if costs:
            known_cost = usage["total"].get("estimatedCny")
            parts.append('<p>已记录模型调用：' + escape(sum(int(r["calls"]) for r in costs)) + ' 次；已记录估算费用：' + (f'{float(known_cost):.4f} 元' if known_cost is not None else '未记录') + '；费用未确认：' + escape(usage["total"].get("unknownCosts", sum(int(r["unknownCosts"]) for r in costs))) + ' 次。此汇总不包含下面未计价的旧生图。</p>')
            parts.append(table(["模型", "调用", "已报告输入 token", "已报告输出 token", "已记录估算费用（元）", "费用未确认调用"], [[r.get("model") or "未记录模型名", r["calls"], r.get("promptTokens") if r.get("kind") != "image" else "按张计费", r.get("completionTokens") if r.get("kind") != "image" else "按张计费", f'{float(r["estimatedCny"]):.4f}' if r.get("estimatedCny") is not None else "未记录", r["unknownCosts"]] for r in costs]))
            unknown_tokens = sum(int(r.get("unknownTokenCalls") or 0) for r in costs if r.get("kind") != "image")
            if unknown_tokens:
                parts.append('<p>' + escape(unknown_tokens) + ' 次文字调用缺少完整 token；上表 token 为已报告部分。</p>')
        elif any(r["event"] == "model_call" and int(r["count"]) for r in result.get("events", [])):
            parts.append('<p>存在模型调用日志，但用量未被统计覆盖，费用尚不可核验。</p>')
        else:
            parts.append('<p>该日没有模型调用记录。</p>')
        legacy = usage.get("legacyPortraits", [])
        if legacy:
            parts.append('<p>旧版生图记录：' + '，'.join(escape({"success": "成功", "failed": "失败"}.get(r["outcome"], r["outcome"])) + ' ' + escape(r["count"]) + ' 次' for r in legacy) + '；当时未记录图片费用，不能按免费或当前单价回填。</p>')
        total = usage["total"]
        rate = total.get("completionRate")
        parts.append('<p>报告完成：' + escape(total["completedReports"]) + '/' + escape(total["reports"]) + '（' + (f'{float(rate)*100:.1f}%' if rate is not None else '暂无报告') + '）。存有图片的报告：' + escape(total["imageReports"]) + '。未知费用预留：' + escape(total.get("outstandingReservedCny")) + ' 元。</p>')
        timing = usage.get("timing", [])
        if timing:
            labels = {"image": "生图", "first_text": "首个文字模块", "complete": "全部已请求模块", "reading_request": "旧版整次解读"}
            parts.append(table(["成功耗时", "样本", "p50 秒", "p95 秒"], [[labels.get(r["metric"], r["metric"]), r["samples"], round(float(r["p50Ms"])/1000, 1), round(float(r["p95Ms"])/1000, 1)] for r in timing]))
        else:
            parts.append('<p>没有可用于耗时统计的成功样本。</p>')
    events = result.get("events", [])
    if events:
        labels = {"chart": "排盘", "reading": "解读", "portrait": "生图", "card_save": "人格卡导出/预览", "module": "生成模块", "report_created": "创建报告"}
        statuses = {"success": "成功", "failed": "失败", "rejected": "拒绝", "partial": "部分完成"}
        relevant = [r for r in events if r["event"] in labels]
        if relevant:
            parts.append('<h2>生成与操作</h2>' + table(["操作", "结果", "次数"], [[labels[r["event"]], statuses.get(r["outcome"], r["outcome"]), r["count"]] for r in relevant]))
    parts.append('<p style="font-size:13px;color:#666">地区为网络出口归属；IP/会话数不等于人数。费用为已记录估算，不是供应商实付账单，未确认费用不算 0。报告状态与存图数是查询时状态。</p></div>')
    return ''.join(parts)


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
        result["reportHtml"] = render_email(result)
        print(json.dumps(result, ensure_ascii=False))
    except Exception:
        print("Daily statistics unavailable", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
