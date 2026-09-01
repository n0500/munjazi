import { useEffect, useRef, useState } from 'react';
import { listClassStudents } from '../lib/studentsApi';
import { listWeeksForClass } from '../lib/weeksApi';
import { buildStudentReportData } from '../lib/reportsApi';
import { exportElementToPdf } from '../lib/pdfExport';
import { STATUS_ICONS, STATUS_COLORS } from '../lib/recommendationsApi';
import { colors, font, radius, spacing } from '../lib/theme';

function StatusBadge({ status, statusLabel }) {
  if (!status) return <span>{statusLabel}</span>;
  const c = STATUS_COLORS[status];
  return (
    <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 6, padding: '2px 6px', fontWeight: 'bold', fontSize: 12, whiteSpace: 'nowrap' }}>
      {STATUS_ICONS[status]} {statusLabel}
    </span>
  );
}

function ActiveActionsSection({ activeActions }) {
  if (!activeActions || activeActions.length === 0) return null;
  return (
    <div className="pdf-avoid-break" style={{ marginBottom: 16 }}>
      {activeActions.map((a, i) => {
        const isRemedial = a.type === 'remedial';
        const bg = isRemedial ? '#fdf3e2' : '#eaf6ee';
        const border = isRemedial ? '#e0b25c' : '#0b7a4b';
        const color = isRemedial ? '#8a5a00' : '#0b5c33';
        return (
          <div
            key={i}
            style={{
              background: bg, border: `1px solid ${border}`, color, borderRadius: 8,
              padding: '10px 12px', marginBottom: 8, fontSize: 13,
            }}
          >
            <strong>{isRemedial ? '⚠ إجراء علاجي' : '⭐ إجراء إثرائي'}</strong>
            {' — '}
            {a.affectedSkillTitles.join('، ')}
            <div style={{ marginTop: 4 }}>{a.text}</div>
          </div>
        );
      })}
    </div>
  );
}

function computeWeeklyMasteryPercent(weeks) {
  return weeks.map((w) => {
    const rated = w.skills.filter((s) => s.status);
    const mastered = rated.filter((s) => s.status === 'mastered');
    const percent = rated.length > 0 ? Math.round((mastered.length / rated.length) * 100) : null;
    return { weekName: w.name, percent };
  });
}

function ProgressLineChart({ weeks }) {
  const points = computeWeeklyMasteryPercent(weeks).filter((p) => p.percent !== null);
  if (points.length < 2) return null;

  const width = 640;
  const height = 140;
  const paddingX = 30;
  const paddingY = 20;
  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  const stepX = chartW / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: paddingX + i * stepX,
    y: paddingY + chartH - (p.percent / 100) * chartH,
    percent: p.percent,
    weekName: p.weekName,
  }));

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');

  return (
    <div className="pdf-avoid-break" style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>تطوّر الإتقان عبر الأسابيع</h3>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: 640 }}>
        {[0, 25, 50, 75, 100].map((v) => {
          const y = paddingY + chartH - (v / 100) * chartH;
          return (
            <g key={v}>
              <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#eee" strokeWidth="1" />
              <text x={paddingX - 6} y={y + 4} fontSize="9" fill="#999" textAnchor="end">{v}%</text>
            </g>
          );
        })}
        <path d={pathD} fill="none" stroke="#0b7a4b" strokeWidth="2" />
        {coords.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r="4" fill="#0b7a4b" />
            <text x={c.x} y={c.y - 10} fontSize="10" fontWeight="bold" fill="#0b5c33" textAnchor="middle">{c.percent}%</text>
            <text x={c.x} y={height - 4} fontSize="9" fill="#666" textAnchor="middle">{c.weekName}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function StudentReport({ schoolId, classId, teacherUid, className, subject, teacherName, onBack }) {
  const [students, setStudents] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [studentId, setStudentId] = useState('');
  const [fromWeekId, setFromWeekId] = useState('');
  const [toWeekId, setToWeekId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState(null);

  const reportRef = useRef(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [studentRows, weekRows] = await Promise.all([
          listClassStudents(schoolId, classId),
          listWeeksForClass(schoolId, classId, teacherUid),
        ]);
        setStudents(studentRows);
        setWeeks(weekRows);
      } catch (err) {
        setError(err.message || 'تعذّر تحميل البيانات.');
      } finally {
        setLoading(false);
      }
    })();
  }, [schoolId, classId, teacherUid]);

  async function handleGenerate(e) {
    e.preventDefault();
    setError('');
    if (!studentId || !fromWeekId || !toWeekId) return;
    setGenerating(true);
    try {
      const student = students.find((s) => s.id === studentId);
      const data = await buildStudentReportData(schoolId, {
        classId,
        teacherUid,
        student,
        className,
        subject,
        teacherName,
        fromWeekId,
        toWeekId,
      });
      setReportData(data);
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (reportRef.current) {
        await exportElementToPdf(reportRef.current, `تقرير-${student.name}.pdf`);
      }
    } catch (err) {
      setError(err.message || 'تعذّر توليد التقرير.');
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
      <h1 style={{ fontFamily: font.family, color: colors.ink }}>تقرير طالبة</h1>

      {error && <div style={{ background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.md }}>{error}</div>}

      <form onSubmit={handleGenerate} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.lg }}>
        <label>الطالبة</label>
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={{ width: '100%', padding: spacing.sm, marginBottom: spacing.sm }} required>
          <option value="">اختيار طالبة</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
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
        <button type="submit" disabled={generating} style={{ padding: '10px 16px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }}>
          {generating ? '...جارٍ التوليد' : 'توليد التقرير وتحميله'}
        </button>
      </form>

      {reportData && (
        <div style={{ position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
          <div ref={reportRef} style={{ width: 700, padding: 30, background: '#fff', fontFamily: 'sans-serif' }} dir="rtl">
            <div className="pdf-avoid-break" style={{ textAlign: 'center', borderBottom: '2px solid #0b7a4b', paddingBottom: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#666' }}>{reportData.schoolName}</div>
              <div style={{ fontSize: 13, color: '#666' }}>المادة: {reportData.subject || 'غير محددة'}</div>
              <div style={{ fontSize: 13, color: '#666' }}>من {reportData.fromWeekName} إلى {reportData.toWeekName}</div>
              <div style={{ fontSize: 16, fontWeight: 'bold', marginTop: 6 }}>تقرير طالبة</div>
            </div>

            <p><strong>الطالبة:</strong> {reportData.studentName}</p>
            <p><strong>الفصل:</strong> {reportData.className}</p>

            <ActiveActionsSection activeActions={reportData.activeActions} />

            <div style={{ display: 'flex', gap: 10, margin: '14px 0', fontSize: 13 }}>
              <span>متقنة: {reportData.statusCounts.mastered}</span>
              <span>تحتاج دعم: {reportData.statusCounts.needsSupport}</span>
              <span>غير متقنة: {reportData.statusCounts.notMastered}</span>
              <span>غائبة: {reportData.statusCounts.absent}</span>
            </div>

            <ProgressLineChart weeks={reportData.weeks} />

            {reportData.weeks.map((w) => (
              <div key={w.id} className="pdf-avoid-break" style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <h3 style={{ margin: '0 0 8px' }}>{w.name} — {w.typeLabel}</h3>
                {w.enrichmentLink && (
                  <p style={{ fontSize: 12 }}>
                    الرابط الإثرائي: <a href={w.enrichmentLink} target="_blank" rel="noreferrer">{w.enrichmentLink}</a>
                  </p>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 4 }}>المهارة</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 4 }}>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w.skills.map((sk, i) => (
                      <tr key={i}>
                        <td style={{ padding: 4, borderBottom: '1px solid #eee' }}>{sk.title}</td>
                        <td style={{ padding: 4, borderBottom: '1px solid #eee' }}><StatusBadge status={sk.status} statusLabel={sk.statusLabel} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {w.recommendation && <p style={{ fontSize: 13, marginTop: 8 }}><strong>التوصية:</strong> {w.recommendation}</p>}
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 30, paddingTop: 16, borderTop: '1px solid #ccc', fontSize: 13 }}>
              <span>مديرة المدرسة: {reportData.principalName || '—'}</span>
              <span>المعلّمة: {reportData.teacherName}</span>
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
