import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('daily', Path(__file__).resolve().parents[1] / 'scripts/fate-stats-readonly.py')
daily = importlib.util.module_from_spec(spec)
spec.loader.exec_module(daily)

class DailyReportTest(unittest.TestCase):
    def test_missing_fields_are_notes_not_blank_tables_and_zero_is_not_unknown(self):
        result = {'period': {'date': '2026-09-27'}, 'totals': dict(visits=1,histories=1,readingCalls=1,uniqueVisitIps=1), 'regions':[dict(country='<script>',province='',city='',visits=1,histories=1,readingCalls=1,uniqueVisitIps=1)], 'audience': {'device':[dict(name='unknown',visits=1,reports=1)]}, 'usage':{'unavailable':True}, 'events':[]}
        rendered = daily.render_email(result)
        self.assertIn('&lt;script&gt;', rendered)
        self.assertNotIn('<script>', rendered)
        self.assertNotIn('设备类型：未知', rendered)
        self.assertIn('该日没有可识别数据', rendered)
        self.assertIn('统计接口暂不可用', rendered)
        result['usage'] = {'date':'2026-09-27','costs':[dict(model='model',kind='text',calls=1,promptTokens=0,completionTokens=None,estimatedCny=None,unknownCosts=1)],'total':dict(reports=1,completedReports=1,imageReports=0,completionRate=1,outstandingReservedCny=0),'timing':[]}
        rendered = daily.render_email(result)
        self.assertIn('>0</td>', rendered)
        self.assertIn('>未记录</td>', rendered)
        self.assertIn('100.0%', rendered)
        result['usage']['date']='2026-09-26'
        with self.assertRaises(ValueError): daily.render_email(result)
        result['usage']['date']='2026-09-27'
        result['totals']['visits']=2
        with self.assertRaises(ValueError): daily.render_email(result)

if __name__ == '__main__': unittest.main()
