import { useEffect, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { listClassStudents } from '../lib/studentsApi';
import { listWeeksForClass } from '../lib/weeksApi';
import { buildStudentReportData } from '../lib/reportsApi';
import { colors, font, radius, spacing } from '../lib/theme';
import StudentReportDocument from './StudentReportDocument';

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

export default function StudentReport({ schoolId, classId, teacherUid, className, subject, teacherName, onBack }) {
  const [students, setStudents] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [studentId, setStudentId] = useState('');
  const [fromWeekId, setFromWeekId] = useState('');
  const [toWeekId, setToWeekId] = useState('');
  const [generating, setGenerating] = useState(false);

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
      const blob = await pdf(<StudentReportDocument data={data} />).toBlob();
      await downloadBlob(blob, `تقرير-${student.name}.pdf`);
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
    </div>
  );
}
