import { useEffect, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { listWeeksForClass } from '../lib/weeksApi';
import { buildClassWeekReportData, buildClassRangeReportData } from '../lib/reportsApi';
import { colors, font, radius, spacing } from '../lib/theme';
import ClassWeekReportDocument from './ClassWeekReportDocument';
import ClassRangeReportDocument from './ClassRangeReportDocument';

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

  async function downloadRangeReportPdf(data) {
    const blob = await pdf(<ClassRangeReportDocument data={data} />).toBlob();
    await downloadBlob(blob, `تقرير-فصل-مدى-أسابيع-${data.className}.pdf`);
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
    if (loading || !defaultWeekName || weeks.length === 0) return;
    const match = weeks.find((w) => w.name === defaultWeekName);
    if (match) {
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
        await downloadRangeReportPdf(data);
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
      } else if (rangeReport) {
        await downloadRangeReportPdf(rangeReport);
      }
    } catch (err) {
      setError(err.message || 'تعذّر تحميل التقرير.');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  const currentReportName = weekReport ? weekReport.weekName : rangeReport ? `${rangeReport.fromWeekName} — ${rangeReport.toWeekName}` : '';

  return (
    <div style={{ maxWidth: 600, margin: '20px auto', padding: spacing.lg }} dir="rtl">
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.primary, marginBottom: spacing.sm }}>
        ← العودة
      </button>
      <h1 style={{ fontFamily: font.family, color: colors.ink }}>تقرير الفصل</h1>

      {error && <div style={{ background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.md }}>{error}</div>}

      {(weekReport || rangeReport) && (
        <div style={{ background: colors.primaryTint, border: `1px solid ${colors.primary}`, color: '#0b5c33', borderRadius: radius.button, padding: spacing.sm, marginBottom: spacing.md, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span>✓ تقرير {currentReportName} جاهز — عدّلي الخيارات بالنموذج لو أردتِ فترة مختلفة.</span>
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
    </div>
  );
}
