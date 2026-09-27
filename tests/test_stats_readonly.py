import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("report", Path(__file__).parents[1] / "scripts/fate-stats-readonly.py")
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


class ReportCommandTest(unittest.TestCase):
    def test_only_calendar_date_is_accepted(self):
        self.assertEqual(report.report_date("2026-09-26"), "2026-09-26")
        for command in ["", "2026-02-30", "2026-09-26;id", "cat /etc/passwd", "2026-09-26\n"]:
            with self.subTest(command=command), self.assertRaises(ValueError):
                report.report_date(command)


if __name__ == "__main__":
    unittest.main()
