import { useEffect, useRef, useState } from 'react';
import { listWeeksForClass } from '../lib/weeksApi';
import { buildClassWeekReportData, buildClassRangeReportData } from '../lib/reportsApi';
import { exportElementToPdf } from '../lib/pdfExport';

const STATUS_KEYS = [
  { key: 'mastered', label: 'متقنة' },
  { key: 'needsSupport', label: 'تحتاج دعم' },
  { key: 'notMastered', label: 'غير متقنة' },
  { key: 'absent', label: 'غائبة' },
];

export default function ClassReport({ schoolId, classId, teacherUid, className, subject, teacherName, onBack }) {
  const [weeks, setWeeks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [mode, setMode] = useState('single');
  const [weekId, setWeekId] = useState('');
  const [fromWeekId, setFromWeekId] = useState('');
  const [toWeekId, setToWeekId] = useState('');
  const [generating, setGenerating] = useState(false);

  const [weekReport, setWeekReport] = useState(null);
  const [rangeReport, setRangeReport] = useState(null);

  const reportRef = useRef(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const rows = await listWeeksForClass(schoolId, classId, teacherUid);
        setWeeks(rows);
      } catch (err) {
        setError(err.message || 'تعذّر تحميل الأسابيع الدراسية.');
      } finally {
        setLoading(false);
      }
    })();
  }, [schoolId, classId, teacherUid]);

  async function handleGenerate(e) {
    e.preventDefault();
    setError('');
    setGenerating(true);
    try {
      if (mode === 'single') {
        if (!weekId) { setGenerating(false); return; }
        const week = weeks.find((w) => w.id === weekId);
        const data = await buildClassWeekReportData(schoolId, {
          classId,
          teacherUid,
          className,
          subject,
          teacherName,
          weekId,
          weekName: week.name,
          weekTypeLabel: week.type === 'remediation' ? 'معالجة' : 'قياس',
          enrichmentLink: week.enrichmentLink || '',
        });
        setWeekReport(data);
        setRangeReport(null);
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (reportRef.current) await exportElementToPdf(reportRef.current, `تقرير-فصل-${week.name}.pdf`, 'l');
      } else {
        if (!fromWeekId || !toWeekId) { setGenerating(false); return; }
        const data = await buildClassRangeReportData(schoolId, {
          classId,
          teacherUid,
          className,
          subject,
          teacherName,
          fromWeekId,
          toWeekId,
        });
        setRangeReport(data);
        setWeekReport(null);
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (reportRef.current) await exportElementToPdf(reportRef.current, `تقرير-فصل-ملخص.pdf`, 'l');
      }
    } catch (err) {
      setError(err.message || 'تعذّر توليد التقرير.');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  return (
    <div style={{ maxWidth: 600, margin: '20px auto', padding: 16 }} dir="rtl">
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#0b7a4b', marginBottom: 10 }}>
        ← العودة
      </button>
      <h1>تقرير الفصل</h1>

      {error && <div style={{ background: '#fdecea', color: '#a10000', padding: 10, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      <form onSubmit={handleGenerate} style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16 }}>
        <label>نوع التقرير</label>
        <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }}>
          <option value="single">أسبوع محدد</option>
          <option value="range">مدى أسابيع (ملخص إحصائي)</option>
        </select>

        {mode === 'single' ? (
          <>
            <label>الأسبوع</label>
            <select value={weekId} onChange={(e) => setWeekId(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required>
              <option value="">اختيار أسبوع</option>
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label>من أسبوع</label>
            <select value={fromWeekId} onChange={(e) => setFromWeekId(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required>
              <option value="">اختيار أسبوع</option>
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <label>إلى أسبوع</label>
            <select value={toWeekId} onChange={(e) => setToWeekId(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required>
              <option value="">اختيار أسبوع</option>
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </>
        )}

        <button type="submit" disabled={generating} style={{ padding: '10px 16px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
          {generating ? '...جارٍ التوليد' : 'توليد التقرير وتحميله'}
        </button>
      </form>

      {(weekReport || rangeReport) && (
        <div style={{ position: 'fixed', top: -99999, left: -99999 }}>
          <div ref={reportRef} style={{ width: 1050, padding: 30, background: '#fff', fontFamily: 'sans-serif' }} dir="rtl">
            {weekReport && (
              <>
                <div style={{ textAlign: 'center', borderBottom: '2px solid #0b7a4b', paddingBottom: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: '#666' }}>{weekReport.schoolName}</div>
                  <div style={{ fontSize: 13, color: '#666' }}>المادة: {weekReport.subject || 'غير محددة'}</div>
                  <div style={{ fontSize: 13, color: '#666' }}>{weekReport.weekName} — {weekReport.weekTypeLabel}</div>
                  <div style={{ fontSize: 16, fontWeight: 'bold', marginTop: 6 }}>تقرير فصل — {weekReport.className}</div>
                </div>
                {weekReport.enrichmentLink && (
                  <p style={{ fontSize: 12 }}>
                    الرابط الإثرائي: <a href={weekReport.enrichmentLink} target="_blank" rel="noreferrer">{weekReport.enrichmentLink}</a>
                  </p>
                )}
                <div style={{ display: 'flex', gap: 10, margin: '14px 0', fontSize: 13 }}>
                  {STATUS_KEYS.map((s) => (
                    <span key={s.key}>{s.label}: {weekReport.classCounts[s.key]}</span>
                  ))}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 4 }}>الطالبة</th>
                      {weekReport.skillTitles.map((t, i) => (
                        <th key={i} style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 4 }}>{t}</th>
                      ))}
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 4 }}>التوصية</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weekReport.rows.map((row, i) => (
                      <tr key={i}>
                        <td style={{ padding: 4, borderBottom: '1px solid #eee' }}>{row.name}</td>
                        {row.cells.map((c, j) => (
                          <td key={j} style={{ padding: 4, borderBottom: '1px solid #eee' }}>{c.statusLabel}</td>
                        ))}
                        <td style={{ padding: 4, borderBottom: '1px solid #eee' }}>{row.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 30, paddingTop: 16, borderTop: '1px solid #ccc', fontSize: 13 }}>
                  <span>مديرة المدرسة: {weekReport.principalName || '—'}</span>
                  <span>المعلّمة: {weekReport.teacherName}</span>
                </div>
              </>
            )}

            {rangeReport && (
              <>
                <div style={{ textAlign: 'center', borderBottom: '2px solid #0b7a4b', paddingBottom: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: '#666' }}>{rangeReport.schoolName}</div>
                  <div style={{ fontSize: 13, color: '#666' }}>المادة: {rangeReport.subject || 'غير محددة'}</div>
                  <div style={{ fontSize: 13, color: '#666' }}>من {rangeReport.fromWeekName} إلى {rangeReport.toWeekName}</div>
                  <div style={{ fontSize: 16, fontWeight: 'bold', marginTop: 6 }}>تقرير فصل — {rangeReport.className}</div>
                </div>

                {rangeReport.weeks.map((w) => (
                  <div key={w.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 14, breakInside: 'avoid' }}>
                    <h3 style={{ margin: '0 0 8px' }}>{w.name} — {w.typeLabel}</h3>
                    {w.enrichmentLink && (
                      <p style={{ fontSize: 12 }}>
                        الرابط الإثرائي: <a href={w.enrichmentLink} target="_blank" rel="noreferrer">{w.enrichmentLink}</a>
                      </p>
                    )}
                    {w.skillTitles.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#999' }}>لا توجد مهارات بهذا الأسبوع.</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 4 }}>الطالبة</th>
                            {w.skillTitles.map((t, i) => (
                              <th key={i} style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 4 }}>{t}</th>
                            ))}
                            <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 4 }}>التوصية</th>
                          </tr>
                        </thead>
                        <tbody>
                          {w.rows.map((row, i) => (
                            <tr key={i}>
                              <td style={{ padding: 4, borderBottom: '1px solid #eee' }}>{row.name}</td>
                              {row.cells.map((c, j) => (
                                <td key={j} style={{ padding: 4, borderBottom: '1px solid #eee' }}>{c.statusLabel}</td>
                              ))}
                              <td style={{ padding: 4, borderBottom: '1px solid #eee' }}>{row.recommendation}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 10, margin: '14px 0', fontSize: 13 }}>
                  <strong>ملخص إحصائي إجمالي:</strong>
                  {STATUS_KEYS.map((s) => (
                    <span key={s.key}>{s.label}: {rangeReport.classCounts[s.key]}</span>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 30, paddingTop: 16, borderTop: '1px solid #ccc', fontSize: 13 }}>
                  <span>مديرة المدرسة: {rangeReport.principalName || '—'}</span>
                  <span>المعلّمة: {rangeReport.teacherName}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
