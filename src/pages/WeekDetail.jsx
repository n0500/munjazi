import { useEffect, useState } from 'react';
import { listSkillsForWeek, createSkill } from '../lib/skillsApi';
import { listAssessmentsForSkill, setAssessment, setAllMasteredForSkill } from '../lib/assessmentsApi';
import { listClassStudents } from '../lib/studentsApi';

const STATUS_LABELS = {
  mastered: 'متقنة',
  needsSupport: 'تحتاج دعم',
  notMastered: 'غير متقنة',
  absent: 'غائبة',
};
const TYPE_LABELS = { measurement: 'قياس', remediation: 'معالجة' };

export default function WeekDetail({ schoolId, classId, teacherUid, week, onBack }) {
  const [students, setStudents] = useState([]);
  const [skills, setSkills] = useState([]);
  const [assessmentsBySkill, setAssessmentsBySkill] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [skillTitle, setSkillTitle] = useState('');
  const [addingSkill, setAddingSkill] = useState(false);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [studentRows, skillRows] = await Promise.all([
        listClassStudents(schoolId, classId),
        listSkillsForWeek(schoolId, week.id),
      ]);
      setStudents(studentRows);
      setSkills(skillRows);
      const assessMap = {};
      await Promise.all(
        skillRows.map(async (s) => {
          assessMap[s.id] = await listAssessmentsForSkill(schoolId, s.id);
        }),
      );
      setAssessmentsBySkill(assessMap);
    } catch (err) {
      setError(err.message || 'تعذّر تحميل بيانات الأسبوع الدراسي.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week.id]);

  async function handleAddSkill(e) {
    e.preventDefault();
    setError('');
    if (!skillTitle.trim() || addingSkill) return;
    setAddingSkill(true);
    try {
      await createSkill(schoolId, { weekId: week.id, classId, teacherUid, title: skillTitle });
      setSkillTitle('');
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر إضافة المهارة.');
    } finally {
      setAddingSkill(false);
    }
  }

  async function handleStatusChange(skillId, studentId, status) {
    setError('');
    try {
      await setAssessment(schoolId, { skillId, weekId: week.id, classId, teacherUid, studentId, status });
      setAssessmentsBySkill((prev) => ({
        ...prev,
        [skillId]: { ...prev[skillId], [studentId]: { ...(prev[skillId]?.[studentId] || {}), status } },
      }));
    } catch (err) {
      setError(err.message || 'تعذّر حفظ التقييم.');
    }
  }

  async function handleSetAllMastered(skillId) {
    setError('');
    try {
      const studentIds = students.map((s) => s.id);
      await setAllMasteredForSkill(schoolId, { skillId, weekId: week.id, classId, teacherUid, studentIds });
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر التعيين الجماعي.');
    }
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  return (
    <div style={{ maxWidth: 900, margin: '20px auto', padding: 16, overflowX: 'auto' }} dir="rtl">
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#0b7a4b', marginBottom: 10 }}>
        ← العودة إلى الأسابيع الدراسية
      </button>
      <h1>{week.name} — {TYPE_LABELS[week.type]}</h1>
      {week.enrichmentLink && (
        <p><a href={week.enrichmentLink} target="_blank" rel="noreferrer">الرابط الإثرائي لهذا الأسبوع</a></p>
      )}

      {error && <div style={{ background: '#fdecea', color: '#a10000', padding: 10, borderRadius: 8, marginBottom: 12 }}>{error}</div>}

      <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>إضافة مهارة جديدة</h3>
        <form onSubmit={handleAddSkill} style={{ display: 'flex', gap: 8 }}>
          <input type="text" placeholder="اسم المهارة" value={skillTitle} onChange={(e) => setSkillTitle(e.target.value)} style={{ flex: 1, padding: 10 }} required />
          <button type="submit" disabled={addingSkill} style={{ padding: '10px 16px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
            {addingSkill ? '...' : 'إضافة'}
          </button>
        </form>
      </div>

      {students.length === 0 ? (
        <p style={{ color: '#666' }}>لا توجد طالبات في هذا الفصل بعد.</p>
      ) : skills.length === 0 ? (
        <p style={{ color: '#666' }}>لا توجد مهارات بهذا الأسبوع الدراسي بعد.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
          <thead>
            <tr>
              <th style={{ padding: 8, textAlign: 'right', borderBottom: '2px solid #ddd', position: 'sticky', right: 0, background: '#fff' }}>الطالبة</th>
              {skills.map((s) => (
                <th key={s.id} style={{ padding: 8, borderBottom: '2px solid #ddd', minWidth: 140 }}>
                  <div>{s.title}</div>
                  <button onClick={() => handleSetAllMastered(s.id)} style={{ marginTop: 4, padding: '2px 8px', fontSize: 11, background: '#eaf6ee', border: '1px solid #0b7a4b', color: '#0b5c33', borderRadius: 6 }}>
                    تعيين الكل: متقنة
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8, position: 'sticky', right: 0, background: '#fff' }}>{student.name}</td>
                {skills.map((s) => {
                  const current = assessmentsBySkill[s.id]?.[student.id]?.status || '';
                  return (
                    <td key={s.id} style={{ padding: 6, textAlign: 'center' }}>
                      <select
                        value={current}
                        onChange={(e) => handleStatusChange(s.id, student.id, e.target.value)}
                        style={{ padding: 4, width: '100%' }}
                      >
                        <option value="">—</option>
                        {Object.entries(STATUS_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
