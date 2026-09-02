import { useEffect, useRef, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { listWeeksForClass } from '../lib/weeksApi';
import { buildClassWeekReportData, buildClassRangeReportData } from '../lib/reportsApi';
import { exportElementToPdf } from '../lib/pdfExport';
import { STATUS_ICONS, STATUS_COLORS } from '../lib/recommendationsApi';
import { colors, font, radius, spacing } from '../lib/theme';
import ClassWeekReportDocument from './ClassWeekReportDocument';

function StatusBadge({ status, statusLabel }) {
  if (!status) return <span>{statusLabel}</span>;
  const c = STATUS_COLORS[status];
  return (
    <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 6, padding: '2px 6px', fontWeight: 'bold', fontSize: 12, whiteSpace: 'nowrap' }}>
      {STATUS_ICONS[status]} {statusLabel}
    </span>
  );
}

function ActionsCell({ actions }) {
  if (!actions || actions.length === 0) return <span style={{ color: '#ccc' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {actions.map((a, i) => (
        <div key={i} style={{ fontSize: 11 }}>
          <span style={{ color: a.type === 'remedial' ? '#8a5a00' : '#0b5c33', fontWeight: 'bold' }}>
            {a.type === 'remedial' ? '⚠' : '⭐'} {a.affectedSkillTitles.join('، ')}:
          </span>
          {' '}{a.text}
        </div>
      ))}
    </div>
  );
}

const STATUS_KEYS = [
  { key: 'mastered', label: 'متقنة' },
  { key: 'needsSupport', label: 'تحتاج دعم' },
  { key: 'notMastered', label: 'غير متقنة' },
  { key: 'absent', label: 'غائبة' },
];

async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ClassReport({ schoolId, classId, teacherUid, className, subject, teacherName, onBack, defaultWeekName }) {
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

  const rangeReportRef = useRef(null);
  const autoGenerateTriedRef = useRef(false);

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

  // مسمى التقرير يتضمّن اسم الفصل صراحة: "تقرير قياس المهارات للصف X" أو "تقرير معالجة المهارات للصف X"
  function reportTypeLabelFor(data) {
    const base = data.weekTypeLabel === 'قياس' ? 'تقرير قياس المهارات' : 'تقرير معالجة المهارات';
    return `${base} للصف ${data.className}`;
  }

  async function downloadWeekReportPdf(data) {
    const blob = await pdf(
      <ClassWeekReportDocument data={data} reportTypeLabel={reportTypeLabelFor(data)} />,
    ).toBlob();
    await downloadBlob(blob, `تقرير-فصل-${data.weekName}.pdf`);
  }

  async function generateSingleWeekReport(targetWeekId, { download } = { download: true }) {
    const week = weeks.find((w) => w.id === targetWeekId);
    if (!week) return;
    setGenerating(true);
    setError('');
    try {
      const data = await buildClassWeekReportData(schoolId, {
        classId,
        teacherUid,
        className,
        subject,
        teacherName,
        weekId: targetWeekId,
        weekName: week.name,
        weekTypeLabel: week.type === 'remediation' ? 'معالجة' : 'قياس',
        enrichmentLink: week.enrichmentLink || '',
      });
      setWeekReport(data);
      setRangeReport(null);
      if (download) {
        await downloadWeekReportPdf(data);
      }
    } catch (err) {
      setError(err.message || 'تعذّر توليد التقرير.');
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (loading || autoGenerateTriedRef.current || !defaultWeekName || weeks.length === 0) return;
    const match = weeks.find((w) => w.name === defaultWeekName);
    if (match) {
      autoGenerateTriedRef.current = true;
      setWeekId(match.id);
      generateSingleWeekReport(match.id, { download: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, weeks, defaultWeekName]);

  async function handleGenerate(e) {
    e.preventDefault();
    setError('');
    setGenerating(true);
    try {
      if (mode === 'single') {
        if (!weekId) { setGenerating(false); return; }
        await generateSingleWeekReport(weekId, { download: true });
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
        if (rangeReportRef.current) await exportElementToPdf(rangeReportRef.current, `تقرير-فصل-ملخص.pdf`, 'l');
      }
    } catch (err) {
      setError(err.message || 'تعذّر توليد التقرير.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadCurrent() {
    setGenerating(true);
    try {
      if (weekReport) {
        await downloadWeekReportPdf(weekReport);
      } else if (rangeReportRef.current) {
        await exportElementToPdf(rangeReportRef.current, `تقرير-فصل-ملخص.pdf`, 'l');
      }
    } catch (err) {
      setError(err.message || 'تعذّر تحميل التقرير.');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  return (
    <div style={{ maxWidth: 600, margin: '20px auto', padding: spacing.lg }} dir="rtl">
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.primary, marginBottom: spacing.sm }}>
        ← العودة
      </button>
      <h1 style={{ fontFamily: font.family, color: colors.ink }}>تقرير الفصل</h1>

      {error && <div style={{ background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.md }}>{error}</div>}

      {weekReport && (
        <div style={{ background: colors.primaryTint, border: `1px solid ${colors.primary}`, color: '#0b5c33', borderRadius: radius.button, padding: spacing.sm, marginBottom: spacing.md, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span>✓ تقرير {weekReport.weekName} جاهز — عدّلي الأسبوع بالنموذج لو أردتِ فترة مختلفة.</span>
          <button onClick={handleDownloadCurrent} disabled={generating} style={{ padding: '6px 14px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button, fontSize: 12, whiteSpace: 'nowrap' }}>
            {generating ? '...' : 'تحميل PDF'}
          </button>
        </div>
      )}

      <form onSubmit={handleGenerate} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.lg }}>
        <label>نوع التقرير</label>
        <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ width: '100%', padding: spacing.sm, marginBottom: spacing.sm }}>
          <option value="single">أسبوع محدد</option>
          <option value="range">مدى أسابيع (ملخص إحصائي)</option>
        </select>

        {mode === 'single' ? (
          <>
            <label>الأسبوع</label>
            <select value={weekId} onChange={(e) => setWeekId(e.target.value)} style={{ width: '100%', padding: spacing.sm, marginBottom: spacing.sm }} required>
              <option value="">اختيار أسبوع</option>
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label>من أسبوع</label>
            <select value={fromWeekId} onChange={(e) => setFromWeekId(e.target.value)} style={{ width: '100%', padding: spacing.sm, marginBottom: spacing.sm }} required>
              <option value="">اختيار أسبوع</option>
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <label>إلى أسبوع</label>
            <select value={toWeekId} onChange={(e) => setToWeekId(e.target.value)} style={{ width: '100%', padding: spacing.sm, marginBottom: spacing.sm }} required>
              <option value="">اختيار أسبوع</option>
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </>
        )}

        <button type="submit" disabled={generating} style={{ padding: '10px 16px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }}>
          {generating ? '...جارٍ التوليد' : 'توليد التقرير وتحميله'}
        </button>
      </form>

      {rangeReport && (
        <div style={{ position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
          <div ref={rangeReportRef} style={{ width: 1050, padding: 30, background: '#fff', fontFamily: 'sans-serif' }} dir="rtl">
            <div style={{ textAlign: 'center', borderBottom: '2px solid #0b7a4b', paddingBottom: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#666' }}>{rangeReport.schoolName}</div>
              <div style={{ fontSize: 13, color: '#666' }}>المادة: {rangeReport.subject || 'غير محددة'}</div>
              <div style={{ fontSize: 13, color: '#666' }}>من {rangeReport.fromWeekName} إلى {rangeReport.toWeekName}</div>
              <div style={{ fontSize: 16, fontWeight: 'bold', marginTop: 6 }}>تقرير فصل — {rangeReport.className}</div>
            </div>

            {rangeReport.weeks.map((w, wIdx) => {
              const isLastWeek = wIdx === rangeReport.weeks.length - 1;
              return (
                <div key={w.id} className="pdf-avoid-break" style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 14 }}>
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
                          {isLastWeek && (
                            <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 4 }}>الإجراء (الوضع الحالي)</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {w.rows.map((row, i) => (
                          <tr key={i}>
                            <td style={{ padding: 4, borderBottom: '1px solid #eee' }}>{row.name}</td>
                            {row.cells.map((c, j) => (
                              <td key={j} style={{ padding: 4, borderBottom: '1px solid #eee' }}><StatusBadge status={c.status} statusLabel={c.statusLabel} /></td>
                            ))}
                            <td style={{ padding: 4, borderBottom: '1px solid #eee' }}>{row.recommendation}</td>
                            {isLastWeek && (
                              <td style={{ padding: 4, borderBottom: '1px solid #eee' }}>
                                <ActionsCell actions={rangeReport.studentActiveActions?.[row.name]} />
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}

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
            <div style={{ textAlign: 'center', marginTop: 20, fontSize: 10, color: '#999' }}>
              صادر من منجزي
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
