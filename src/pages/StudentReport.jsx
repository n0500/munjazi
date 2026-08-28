import { useEffect, useRef, useState } from 'react';
import { listClassStudents } from '../lib/studentsApi';
import { listWeeksForClass } from '../lib/weeksApi';
import { buildStudentReportData } from '../lib/reportsApi';
import { exportElementToPdf } from '../lib/pdfExport';
import { STATUS_ICONS, STATUS_COLORS } from '../lib/recommendationsApi';

function StatusBadge({ status, statusLabel }) {
  if (!status) return <span>{statusLabel}</span>;
  const colors = STATUS_COLORS[status];
  return (
    <span style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '2px 6px', fontWeight: 'bold', fontSize: 12, whiteSpace: 'nowrap' }}>
      {STATUS_ICONS[status]} {statusLabel}
    </span>
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
    <div style={{ maxWidth: 600, margin: '20px auto', padding: 16 }} dir="rtl">
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#0b7a4b', marginBottom: 10 }}>
        ← العودة
      </button>
      <h1>تقرير طالبة</h1>

      {error && <div style={{ background: '#fdecea', color: '#a10000', padding: 10, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      <form onSubmit={handleGenerate} style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16 }}>
        <label>الطالبة</label>
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required>
          <option value="">اختيار طالبة</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
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
        <button type="submit" disabled={generating} style={{ padding: '10px 16px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
          {generating ? '...جارٍ التوليد' : 'توليد التقرير وتحميله'}
        </button>
      </form>

      {reportData && (
        <div style={{ position: 'fixed', top: -99999, left: -99999 }}>
          <div ref={reportRef} style={{ width: 700, padding: 30, background: '#fff', fontFamily: 'sans-serif' }} dir="rtl">
            <div style={{ textAlign: 'center', borderBottom: '2px solid #0b7a4b', paddingBottom: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#666' }}>{reportData.schoolName}</div>
              <div style={{ fontSize: 13, color: '#666' }}>المادة: {reportData.subject || 'غير محددة'}</div>
              <div style={{ fontSize: 13, color: '#666' }}>من {reportData.fromWeekName} إلى {reportData.toWeekName}</div>
              <div style={{ fontSize: 16, fontWeight: 'bold', marginTop: 6 }}>تقرير طالبة</div>
            </div>

            <p><strong>الطالبة:</strong> {reportData.studentName}</p>
            <p><strong>الفصل:</strong> {reportData.className}</p>

            <div style={{ display: 'flex', gap: 10, margin: '14px 0', fontSize: 13 }}>
              <span>متقنة: {reportData.statusCounts.mastered}</span>
              <span>تحتاج دعم: {reportData.statusCounts.needsSupport}</span>
              <span>غير متقنة: {reportData.statusCounts.notMastered}</span>
              <span>غائبة: {reportData.statusCounts.absent}</span>
            </div>

            {reportData.weeks.map((w) => (
              <div key={w.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
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
          </div>
        </div>
      )}
    </div>
  );
}
