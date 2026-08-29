import { useEffect, useState } from 'react';
import { listSkillsForWeek, createSkill } from '../lib/skillsApi';
import { listAssessmentsForSkill, setAssessment, setAllMasteredForSkill } from '../lib/assessmentsApi';
import { listClassStudents } from '../lib/studentsApi';
import { updateWeek } from '../lib/weeksApi';
import { STATUS_LABELS, STATUS_ICONS, STATUS_COLORS, listAllRecommendationsForStatus, addCustomRecommendation } from '../lib/recommendationsApi';
import {
  listRecommendationsForWeek,
  setWeekRecommendation,
  autoFillEncouragementForMastered,
  worstStatus,
} from '../lib/weekRecommendationsApi';
import { checkAndSuggestActionsForWeek, listActionsForClass } from '../lib/actionEngine';
import ActionColumn from '../components/ActionColumn';

const TYPE_LABELS = { measurement: 'قياس', remediation: 'معالجة' };
const NEW_RECOMMENDATION_VALUE = '__new__';

export default function WeekDetail({ schoolId, classId, teacherUid, week, onBack }) {
  const [students, setStudents] = useState([]);
  const [skills, setSkills] = useState([]);
  const [assessmentsBySkill, setAssessmentsBySkill] = useState({});
  const [weekRecommendations, setWeekRecommendations] = useState({});
  const [recommendationsByStatus, setRecommendationsByStatus] = useState({});
  const [actionsByStudent, setActionsByStudent] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [skillTitle, setSkillTitle] = useState('');
  const [addingSkill, setAddingSkill] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [checkingActions, setCheckingActions] = useState(false);

  const [editingLink, setEditingLink] = useState(false);
  const [linkDraft, setLinkDraft] = useState(week.enrichmentLink || '');
  const [savingLink, setSavingLink] = useState(false);

  async function refreshActions() {
    const allActions = await listActionsForClass(schoolId, classId);
    const grouped = {};
    allActions.forEach((a) => {
      if (a.status !== 'active') return;
      if (!grouped[a.studentId]) grouped[a.studentId] = [];
      grouped[a.studentId].push(a);
    });
    setActionsByStudent(grouped);
  }

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

      const recRows = await listRecommendationsForWeek(schoolId, week.id);
      setWeekRecommendations(recRows);

      const libMap = {};
      await Promise.all(
        ['needsSupport', 'notMastered', 'absent'].map(async (status) => {
          libMap[status] = await listAllRecommendationsForStatus(schoolId, teacherUid, status);
        }),
      );
      setRecommendationsByStatus(libMap);

      await refreshActions();
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

  async function handleCheckActions() {
    setError('');
    setCheckingActions(true);
    try {
      await checkAndSuggestActionsForWeek(schoolId, { classId, teacherUid, week, students });
      await refreshActions();
    } catch (err) {
      setError(err.message || 'تعذّر فحص الإجراءات.');
    } finally {
      setCheckingActions(false);
    }
  }

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

  function statusesForStudent(studentId) {
    return skills
      .map((s) => assessmentsBySkill[s.id]?.[studentId]?.status)
      .filter(Boolean);
  }

  function isFullyMastered(studentId) {
    const statuses = statusesForStudent(studentId);
    return statuses.length > 0 && statuses.length === skills.length && statuses.every((st) => st === 'mastered');
  }

  async function handleAutoFillMastered() {
    setError('');
    setAutoFilling(true);
    try {
      const fullyMasteredStudentIds = students.filter((s) => isFullyMastered(s.id)).map((s) => s.id);
      await autoFillEncouragementForMastered(schoolId, { weekId: week.id, classId, teacherUid, fullyMasteredStudentIds });
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر التعبئة التلقائية.');
    } finally {
      setAutoFilling(false);
    }
  }

  async function handleRecommendationSelect(studentId, status, value) {
    setError('');
    if (value === NEW_RECOMMENDATION_VALUE) {
      const text = window.prompt('اكتبي نص التوصية الجديدة:');
      if (!text || !text.trim()) return;
      try {
        if (status) await addCustomRecommendation(schoolId, teacherUid, status, text);
        await setWeekRecommendation(schoolId, { weekId: week.id, classId, teacherUid, studentId, text: text.trim() });
        setWeekRecommendations((prev) => ({ ...prev, [studentId]: text.trim() }));
        if (status) {
          const updated = await listAllRecommendationsForStatus(schoolId, teacherUid, status);
          setRecommendationsByStatus((prev) => ({ ...prev, [status]: updated }));
        }
      } catch (err) {
        setError(err.message || 'تعذّر إضافة التوصية.');
      }
      return;
    }
    try {
      await setWeekRecommendation(schoolId, { weekId: week.id, classId, teacherUid, studentId, text: value });
      setWeekRecommendations((prev) => ({ ...prev, [studentId]: value }));
    } catch (err) {
      setError(err.message || 'تعذّر حفظ التوصية.');
    }
  }

  async function handleRecommendationTextEdit(studentId, text) {
    setWeekRecommendations((prev) => ({ ...prev, [studentId]: text }));
  }

  async function handleRecommendationTextSave(studentId) {
    setError('');
    try {
      await setWeekRecommendation(schoolId, { weekId: week.id, classId, teacherUid, studentId, text: weekRecommendations[studentId] || '' });
    } catch (err) {
      setError(err.message || 'تعذّر حفظ التوصية.');
    }
  }

  async function handleSaveLink() {
    setError('');
    setSavingLink(true);
    try {
      await updateWeek(schoolId, week.id, { name: week.name, type: week.type, enrichmentLink: linkDraft });
      week.enrichmentLink = linkDraft.trim();
      setEditingLink(false);
    } catch (err) {
      setError(err.message || 'تعذّر حفظ الرابط الإثرائي.');
    } finally {
      setSavingLink(false);
    }
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  return (
    <div style={{ maxWidth: 950, margin: '20px auto', padding: 16, overflowX: 'auto' }} dir="rtl">
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#0b7a4b', marginBottom: 10 }}>
        ← العودة إلى الأسابيع الدراسية
      </button>
      <h1>{week.name} — {TYPE_LABELS[week.type]}</h1>
      {week.enrichmentLink && !editingLink && (
        <p>
          <a href={week.enrichmentLink} target="_blank" rel="noreferrer">الرابط الإثرائي لهذا الأسبوع</a>
          {' '}
          <button onClick={() => { setLinkDraft(week.enrichmentLink); setEditingLink(true); }} style={{ background: 'none', border: 'none', color: '#0b7a4b', fontSize: 12 }}>
            (تعديل)
          </button>
        </p>
      )}
      {!week.enrichmentLink && !editingLink && (
        <p>
          <button onClick={() => { setLinkDraft(''); setEditingLink(true); }} style={{ background: 'none', border: 'none', color: '#0b7a4b', fontSize: 13 }}>
            + إضافة رابط إثرائي
          </button>
        </p>
      )}
      {editingLink && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input type="text" value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} placeholder="رابط إثرائي" style={{ flex: 1, padding: 8 }} />
          <button onClick={handleSaveLink} disabled={savingLink} style={{ padding: '8px 14px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
            {savingLink ? '...' : 'حفظ'}
          </button>
          <button onClick={() => setEditingLink(false)} style={{ padding: '8px 14px', background: '#f2f2f2', border: 'none', borderRadius: 8 }}>
            إلغاء
          </button>
        </div>
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
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={handleAutoFillMastered} disabled={autoFilling} style={{ padding: '8px 14px', background: '#eaf6ee', border: '1px solid #0b7a4b', color: '#0b5c33', borderRadius: 8, fontSize: 13 }}>
              {autoFilling ? '...' : 'توصيات تلقائية للمتقنات'}
            </button>
            <button onClick={handleCheckActions} disabled={checkingActions} style={{ padding: '8px 14px', background: '#fdf3e2', border: '1px solid #e0b25c', color: '#8a5a00', borderRadius: 8, fontSize: 13 }}>
              {checkingActions ? '...' : 'فحص الإجراءات المتكررة'}
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ padding: 8, textAlign: 'right', borderBottom: '2px solid #ddd', position: 'sticky', right: 0, background: '#fff' }}>الطالبة</th>
                {skills.map((s) => (
                  <th key={s.id} style={{ padding: 8, borderBottom: '2px solid #ddd', minWidth: 130 }}>
                    <div>{s.title}</div>
                    <button onClick={() => handleSetAllMastered(s.id)} style={{ marginTop: 4, padding: '2px 8px', fontSize: 11, background: '#eaf6ee', border: '1px solid #0b7a4b', color: '#0b5c33', borderRadius: 6 }}>
                      تعيين الكل: متقنة
                    </button>
                  </th>
                ))}
                <th style={{ padding: 8, borderBottom: '2px solid #ddd', minWidth: 200 }}>التوصية</th>
                <th style={{ padding: 8, borderBottom: '2px solid #ddd', minWidth: 150 }}>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const statuses = statusesForStudent(student.id);
                const fullyMastered = isFullyMastered(student.id);
                const relevantStatus = fullyMastered ? null : worstStatus(statuses);
                const options = relevantStatus ? (recommendationsByStatus[relevantStatus] || []) : [];
                return (
                  <tr key={student.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 8, position: 'sticky', right: 0, background: '#fff' }}>{student.name}</td>
                    {skills.map((s) => {
                      const current = assessmentsBySkill[s.id]?.[student.id]?.status || '';
                      const colors = current ? STATUS_COLORS[current] : null;
                      return (
                        <td key={s.id} style={{ padding: 6, textAlign: 'center' }}>
                          <select
                            value={current}
                            onChange={(e) => handleStatusChange(s.id, student.id, e.target.value)}
                            style={{
                              padding: 4,
                              width: '100%',
                              background: colors ? colors.bg : '#fff',
                              color: colors ? colors.text : '#000',
                              border: colors ? `1px solid ${colors.border}` : '1px solid #ccc',
                              fontWeight: colors ? 'bold' : 'normal',
                              borderRadius: 4,
                            }}
                          >
                            <option value="">—</option>
                            {Object.entries(STATUS_LABELS).map(([val, label]) => (
                              <option key={val} value={val}>{STATUS_ICONS[val]} {label}</option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                    <td style={{ padding: 6 }}>
                      {options.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => handleRecommendationSelect(student.id, relevantStatus, e.target.value)}
                          style={{ padding: 4, width: '100%', marginBottom: 4, fontSize: 12 }}
                        >
                          <option value="">اختيار توصية جاهزة</option>
                          {options.map((rec) => (
                            <option key={rec.id} value={rec.text}>{rec.text}</option>
                          ))}
                          <option value={NEW_RECOMMENDATION_VALUE}>+ إضافة توصية جديدة</option>
                        </select>
                      )}
                      <textarea
                        value={weekRecommendations[student.id] || ''}
                        onChange={(e) => handleRecommendationTextEdit(student.id, e.target.value)}
                        onBlur={() => handleRecommendationTextSave(student.id)}
                        placeholder="التوصية قابلة للتعديل"
                        style={{ padding: 4, width: '100%', fontSize: 12, minHeight: 40 }}
                      />
                    </td>
                    <td style={{ padding: 6 }}>
                      <ActionColumn
                        schoolId={schoolId}
                        teacherUid={teacherUid}
                        studentName={student.name}
                        actions={actionsByStudent[student.id]}
                        onChanged={refreshActions}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
