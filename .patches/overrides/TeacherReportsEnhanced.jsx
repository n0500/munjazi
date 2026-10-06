import React, { useEffect, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import StudentReport from './StudentReport.js';
import ClassReport from './ClassReport.js';
import TeacherAllClassesReportDocument from './TeacherAllClassesReportDocument.jsx';
import AllClassesTrackingReportDocument from './AllClassesTrackingReportDocument.jsx';
import AllClassesRangeTrackingReportDocument from './AllClassesRangeTrackingReportDocument.jsx';
import ImpactReportDocument from './ImpactReportDocument.jsx';
import { buildEnhancedAllClassesAnalysisData } from '../lib/EnhancedAllClassesAnalysisApi.js';
import { buildImpactReportData, loadPeriodContext } from '../lib/impactReportsApi.js';
import { buildClassWeekReportData, buildClassRangeReportData } from '../lib/reportsApi.js';
import { normalizeWeekName } from '../lib/dataLogic.js';
import { colors, font, radius, spacing } from '../lib/theme.js';

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function weekTypeLabel(week) {
  if (!week) return '—';
  if (week.type !== 'remediation') return 'قياس';
  return `معالجة ${Math.max(1, Number(week.remediationStage) || 1)}`;
}

export default function TeacherReports({ schoolId, teacherUid, teacherName, assignments, classNameFor }) {
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id || '');
  const [mode, setMode] = useState(null);
  const [periodContext, setPeriodContext] = useState({ weekLists: {}, periodOptions: [] });
  const [fromWeekName, setFromWeekName] = useState('');
  const [toWeekName, setToWeekName] = useState('');
  const [trackingMode, setTrackingMode] = useState('single');
  const [trackingWeekName, setTrackingWeekName] = useState('');
  const [trackingFromWeekName, setTrackingFromWeekName] = useState('');
  const [trackingToWeekName, setTrackingToWeekName] = useState('');
  const [periodLoading, setPeriodLoading] = useState(true);
  const [generating, setGenerating] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const assignment = assignmentId === 'all'
    ? null
    : assignments.find((a) => a.id === assignmentId) || null;

  useEffect(() => {
    setAssignmentId((current) => (
      current === 'all' || assignments.some((a) => a.id === current)
        ? current
        : assignments[0]?.id || ''
    ));
    setMode(null);
  }, [assignments]);

  useEffect(() => {
    (async () => {
      setPeriodLoading(true);
      setError('');
      try {
        const ctx = await loadPeriodContext(schoolId, assignments);
        setPeriodContext(ctx);
        const opts = ctx.periodOptions || [];
        setFromWeekName((v) => opts.includes(v) ? v : (opts[0] || ''));
        setToWeekName((v) => opts.includes(v) ? v : (opts[opts.length - 1] || ''));
        setTrackingWeekName((v) => opts.includes(v) ? v : (opts[opts.length - 1] || ''));
        setTrackingFromWeekName((v) => opts.includes(v) ? v : (opts[0] || ''));
        setTrackingToWeekName((v) => opts.includes(v) ? v : (opts[opts.length - 1] || ''));
      } catch (err) {
        setError(err.message || 'تعذّر تحميل فترة التقارير.');
      } finally {
        setPeriodLoading(false);
      }
    })();
  }, [schoolId, assignments]);

  if (mode === 'student' && assignment) {
    return <StudentReport
      schoolId={schoolId}
      classId={assignment.classId}
      teacherUid={teacherUid}
      assignmentId={assignment.id}
      className={classNameFor(assignment.classId)}
      subject={assignment.subject || ''}
      teacherName={teacherName}
      onBack={() => setMode(null)}
    />;
  }

  if (mode === 'class' && assignment) {
    return <ClassReport
      schoolId={schoolId}
      classId={assignment.classId}
      teacherUid={teacherUid}
      assignmentId={assignment.id}
      className={classNameFor(assignment.classId)}
      subject={assignment.subject || ''}
      teacherName={teacherName}
      onBack={() => setMode(null)}
    />;
  }

  async function downloadAllClasses() {
    if (generating || !fromWeekName || !toWeekName) return;
    setGenerating('classes');
    setError('');
    setSuccess('');
    try {
      const data = await buildEnhancedAllClassesAnalysisData(schoolId, {
        assignments,
        classNameFor,
        teacherName,
        fromWeekName,
        toWeekName,
        periodContext,
      });
      const blob = await pdf(<TeacherAllClassesReportDocument data={data} />).toBlob();
      saveBlob(blob, `تحليل-نتائج-جميع-الفصول-${fromWeekName}-${toWeekName}.pdf`);
      setSuccess('تم إعداد تحليل جميع الفصول بصيغته التفصيلية.');
    } catch (err) {
      setError(err.message || 'تعذّر توليد تحليل جميع الفصول.');
    } finally {
      setGenerating('');
    }
  }

  async function downloadImpact() {
    if (generating || !fromWeekName || !toWeekName) return;
    setGenerating('impact');
    setError('');
    setSuccess('');
    try {
      const data = await buildImpactReportData(schoolId, {
        assignments,
        classes: assignments.map((a) => ({ id: a.classId, name: classNameFor(a.classId) })),
        teacherName,
        fromWeekName,
        toWeekName,
        periodContext,
        audience: 'teacher',
      });
      const blob = await pdf(<ImpactReportDocument data={data} />).toBlob();
      saveBlob(blob, `تقرير-الأثر-العام-${fromWeekName}-${toWeekName}.pdf`);
      setSuccess('تم إعداد تقرير الأثر العام.');
    } catch (err) {
      setError(err.message || 'تعذّر توليد تقرير الأثر العام.');
    } finally {
      setGenerating('');
    }
  }

  async function downloadAllTracking() {
    if (generating || !trackingWeekName) return;
    setGenerating('tracking');
    setError('');
    setSuccess('');

    try {
      const reports = [];
      const wanted = normalizeWeekName(trackingWeekName);

      for (const a of assignments) {
        const weeks = periodContext.weekLists?.[a.id] || [];
        const week = weeks.find((w) => normalizeWeekName(w.name) === wanted);
        if (!week) continue;

        // eslint-disable-next-line no-await-in-loop
        const data = await buildClassWeekReportData(schoolId, {
          classId: a.classId,
          teacherUid: a.teacherUid || teacherUid,
          assignmentId: a.id,
          className: classNameFor(a.classId),
          subject: a.subject || '',
          teacherName: a.teacherName || teacherName,
          weekId: week.id,
          weekName: week.name,
          weekTypeLabel: weekTypeLabel(week),
          enrichmentLink: week.enrichmentLink || '',
        });
        reports.push(data);
      }

      if (!reports.length) {
        throw new Error('لا توجد فصول لديها رصد في الأسبوع المحدد.');
      }

      const blob = await pdf(<AllClassesTrackingReportDocument reports={reports} />).toBlob();
      saveBlob(blob, `تقرير-رصد-جميع-الفصول-${trackingWeekName}.pdf`);

      const skipped = assignments.length - reports.length;
      setSuccess(
        skipped > 0
          ? `تم إعداد تقرير موحّد لـ ${reports.length} فصل/إسناد. لم تُدرج ${skipped} لعدم وجود رصد في الأسبوع المحدد.`
          : `تم إعداد تقرير رصد جميع الفصول في ملف PDF واحد (${reports.length} فصل/إسناد).`,
      );
    } catch (err) {
      setError(err.message || 'تعذّر إعداد تقرير رصد جميع الفصول.');
    } finally {
      setGenerating('');
    }
  }

  async function downloadAllTrackingRange() {
    if (generating || !trackingFromWeekName || !trackingToWeekName) return;
    setGenerating('tracking-range');
    setError('');
    setSuccess('');

    try {
      const reports = [];
      const fromWanted = normalizeWeekName(trackingFromWeekName);
      const toWanted = normalizeWeekName(trackingToWeekName);

      for (const a of assignments) {
        const weeks = periodContext.weekLists?.[a.id] || [];
        const fromWeek = weeks.find((w) => normalizeWeekName(w.name) === fromWanted);
        const toWeek = weeks.find((w) => normalizeWeekName(w.name) === toWanted);
        if (!fromWeek || !toWeek) continue;

        const data = await buildClassRangeReportData(schoolId, {
          classId: a.classId,
          teacherUid: a.teacherUid || teacherUid,
          assignmentId: a.id,
          className: classNameFor(a.classId),
          subject: a.subject || '',
          teacherName: a.teacherName || teacherName,
          fromWeekId: fromWeek.id,
          toWeekId: toWeek.id,
        });

        if ((data.weeks || []).length > 0) reports.push(data);
      }

      if (!reports.length) {
        throw new Error('لا توجد فصول لديها رصد داخل المدى المحدد.');
      }

      const blob = await pdf(<AllClassesRangeTrackingReportDocument reports={reports} />).toBlob();
      saveBlob(blob, `تقرير-رصد-جميع-الفصول-${trackingFromWeekName}-إلى-${trackingToWeekName}.pdf`);

      const skipped = assignments.length - reports.length;
      setSuccess(
        skipped > 0
          ? `تم إعداد تقرير مدى أسابيع لـ ${reports.length} فصل/إسناد. لم تُدرج ${skipped} لعدم وجود رصد داخل المدى المحدد.`
          : `تم إعداد تقرير رصد جميع الفصول لمدى الأسابيع في ملف PDF واحد (${reports.length} فصل/إسناد).`,
      );
    } catch (err) {
      setError(err.message || 'تعذّر إعداد تقرير مدى أسابيع لجميع الفصول.');
    } finally {
      setGenerating('');
    }
  }

  const opts = periodContext.periodOptions || [];

  return <div style={{ maxWidth: 780, margin: '0 auto' }} dir="rtl">
    <h2 style={{ fontFamily: font.family, color: colors.ink }}>التقارير</h2>

    {error && <div style={{ background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.md }}>{error}</div>}
    {success && <div style={{ background: colors.primaryTint, color: '#0b5c33', padding: 10, borderRadius: radius.button, marginBottom: spacing.md }}>{success}</div>}

    {assignments.length === 0 ? <p style={{ color: colors.textMuted }}>لا توجد إسنادات نشطة لإعداد التقارير.</p> : <>
      <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.md }}>
        <h3 style={{ marginTop: 0, fontFamily: font.family }}>التقارير الشاملة</h3>
        <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 0 }}>
          حددي الفترة مرة واحدة، ثم اختاري التقرير المطلوب.
        </p>

        {periodLoading ? <p style={{ color: colors.textMuted, fontSize: 13 }}>جارٍ تحميل الأسابيع...</p> : opts.length === 0 ? <p style={{ color: colors.textMuted, fontSize: 13 }}>لا توجد أسابيع متاحة لإعداد التقارير الشاملة.</p> : <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <label style={{ flex: '1 1 170px', fontSize: 13 }}>
              من أسبوع
              <select value={fromWeekName} onChange={(e) => setFromWeekName(e.target.value)} style={{ width: '100%', padding: 9, marginTop: 4 }}>
                {opts.map((n) => <option key={`f-${n}`} value={n}>{n}</option>)}
              </select>
            </label>
            <label style={{ flex: '1 1 170px', fontSize: 13 }}>
              إلى أسبوع
              <select value={toWeekName} onChange={(e) => setToWeekName(e.target.value)} style={{ width: '100%', padding: 9, marginTop: 4 }}>
                {opts.map((n) => <option key={`t-${n}`} value={n}>{n}</option>)}
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={downloadAllClasses}
              disabled={!!generating}
              style={{ flex: '1 1 210px', padding: '10px 14px', background: colors.ink, color: '#fff', border: 'none', borderRadius: radius.button, fontWeight: 'bold' }}
            >
              {generating === 'classes' ? 'جارٍ التوليد...' : 'تحليل نتائج جميع الفصول'}
            </button>
            <button
              onClick={downloadImpact}
              disabled={!!generating}
              style={{ flex: '1 1 210px', padding: '10px 14px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button, fontWeight: 'bold' }}
            >
              {generating === 'impact' ? 'جارٍ التوليد...' : 'تقرير الأثر العام'}
            </button>
          </div>

          <p style={{ fontSize: 11, color: colors.textMuted, marginBottom: 0, marginTop: 8 }}>
            تحليل جميع الفصول يتضمن الرسوم البيانية، الاتجاه عبر الأسابيع، الخريطة الحرارية للمهارات، أثر المعالجة، التنبيهات والأولويات.
          </p>
        </>}
      </div>

      <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.lg }}>
        <h3 style={{ marginTop: 0, fontFamily: font.family }}>تقارير الفصل والطالبة</h3>

        <label>المادة والفصل</label>
        <select
          value={assignmentId}
          onChange={(e) => { setAssignmentId(e.target.value); setMode(null); setSuccess(''); }}
          style={{ width: '100%', padding: 10, margin: '6px 0 16px' }}
        >
          <option value="all">الكل — جميع الفصول</option>
          {assignments.map((a) => <option key={a.id} value={a.id}>{a.subject || 'بدون مادة'} — {classNameFor(a.classId)}</option>)}
        </select>

        {assignmentId === 'all' ? <>
          <div style={{ background: colors.primaryTint, borderRadius: radius.button, padding: spacing.md, marginBottom: spacing.md }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>نوع تقرير جميع الفصول</label>
            <select
              value={trackingMode}
              onChange={(e) => setTrackingMode(e.target.value)}
              style={{ width: '100%', padding: 10, marginBottom: 12 }}
            >
              <option value="single">أسبوع محدد</option>
              <option value="range">مدى أسابيع</option>
            </select>

            {trackingMode === 'single' ? <>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>الأسبوع المراد تنزيل رصد جميع الفصول له</label>
              <select
                value={trackingWeekName}
                onChange={(e) => setTrackingWeekName(e.target.value)}
                style={{ width: '100%', padding: 10 }}
                disabled={periodLoading || opts.length === 0}
              >
                {opts.map((n) => <option key={`r-${n}`} value={n}>{n}</option>)}
              </select>
            </> : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ flex: '1 1 180px', fontSize: 13 }}>
                من أسبوع
                <select
                  value={trackingFromWeekName}
                  onChange={(e) => setTrackingFromWeekName(e.target.value)}
                  style={{ width: '100%', padding: 10, marginTop: 4 }}
                  disabled={periodLoading || opts.length === 0}
                >
                  {opts.map((n) => <option key={`rf-${n}`} value={n}>{n}</option>)}
                </select>
              </label>
              <label style={{ flex: '1 1 180px', fontSize: 13 }}>
                إلى أسبوع
                <select
                  value={trackingToWeekName}
                  onChange={(e) => setTrackingToWeekName(e.target.value)}
                  style={{ width: '100%', padding: 10, marginTop: 4 }}
                  disabled={periodLoading || opts.length === 0}
                >
                  {opts.map((n) => <option key={`rt-${n}`} value={n}>{n}</option>)}
                </select>
              </label>
            </div>}
          </div>

          <button
            onClick={trackingMode === 'single' ? downloadAllTracking : downloadAllTrackingRange}
            disabled={
              !!generating
              || periodLoading
              || (trackingMode === 'single' ? !trackingWeekName : (!trackingFromWeekName || !trackingToWeekName))
            }
            style={{ width: '100%', padding: '12px 16px', background: colors.ink, color: '#fff', border: 'none', borderRadius: radius.button, fontWeight: 'bold' }}
          >
            {generating === 'tracking' || generating === 'tracking-range'
              ? 'جارٍ إعداد تقارير الفصول...'
              : trackingMode === 'single'
                ? 'تحميل تقرير رصد جميع الفصول PDF'
                : 'تحميل تقرير مدى أسابيع لجميع الفصول PDF'}
          </button>

          <p style={{ fontSize: 11, color: colors.textMuted, marginBottom: 0 }}>
            في «أسبوع محدد» يُنشئ منجزي تقرير رصد موحّد لجميع الفصول لذلك الأسبوع. وفي «مدى أسابيع» يجمع رصد جميع الفصول لكل الأسابيع الواقعة بين البداية والنهاية في ملف PDF واحد.
          </p>
        </> : <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setMode('student')} style={{ flex: '1 1 180px', padding: '12px 16px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }}>تقرير طالبة</button>
          <button onClick={() => setMode('class')} style={{ flex: '1 1 180px', padding: '12px 16px', background: colors.ink, color: '#fff', border: 'none', borderRadius: radius.button }}>تقرير الفصل</button>
        </div>}
      </div>
    </>}
  </div>;
}
