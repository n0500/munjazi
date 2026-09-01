import { useEffect, useRef, useState } from 'react';
import { listSkillsForWeek, createSkill, updateSkillTitle, deleteSkillWithAssessments } from '../lib/skillsApi';
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
import { colors, font, radius, spacing } from '../lib/theme';

const TYPE_LABELS = { measurement: 'قياس', remediation: 'معالجة' };
const NEW_RECOMMENDATION_VALUE = '__new__';
const AUTO_CHECK_DELAY_MS = 2500;

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
  const [autoCheckNotice, setAutoCheckNotice] = useState(false);

  const [editingSkillId, setEditingSkillId] = useState(null);
  const [editSkillTitleValue, setEditSkillTitleValue] = useState('');
  const [savingSkillTitle, setSavingSkillTitle] = useState(false);
  const [deletingSkillId, setDeletingSkillId] = useState(null);

  const [editingLink, setEditingLink] = useState(false);
  const [linkDraft, setLinkDraft] = useState(week.enrichmentLink || '');
  const [savingLink, setSavingLink] = useState(false);

  const autoCheckTimer = useRef(null);

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

  useEffect(() => {
    return () => {
      if (autoCheckTimer.current) clearTimeout(autoCheckTimer.current);
    };
  }, []);

  function scheduleAutoCheck() {
    if (autoCheckTimer.current) clearTimeout(autoCheckTimer.current);
    autoCheckTimer.current = setTimeout(async () => {
      try {
        const currentStudents = await listClassStudents(schoolId, classId);
        await checkAndSuggestActionsForWeek(schoolId, { classId, teacherUid, week, students: currentStudents });
        await refreshActions();
        setAutoCheckNotice(true);
        setTimeout(() => setAutoCheckNotice(false), 3000);
      } catch (err) {
        setError(err.message || 'تعذّر فحص الإجراءات تلقائيًا.');
      }
    }, AUTO_CHECK_DELAY_MS);
  }

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

  function startEditSkill(skill) {
    setEditingSkillId(skill.id);
    setEditSkillTitleValue(skill.title);
  }

  async function handleSaveSkillTitle(skillId) {
    setError('');
    setSavingSkillTitle(true);
    try {
      await updateSkillTitle(schoolId, skillId, editSkillTitleValue);
      setEditingSkillId(null);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر تعديل اسم المهارة.');
    } finally {
      setSavingSkillTitle(false);
    }
  }

  async function handleDeleteSkill(skill) {
    const confirmed = window.confirm(
      `متأكدة تبين تحذفين مهارة "${skill.title}"؟ سيتم حذف جميع التقييمات المسجَّلة عليها لكل الطالبات، ولا يمكن التراجع عن هذا الإجراء.`,
    );
    if (!confirmed) return;
    setError('');
    setDeletingSkillId(skill.id);
    try {
      await deleteSkillWithAssessments(schoolId, skill.id);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر حذف المهارة.');
    } finally {
      setDeletingSkillId(null);
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
      scheduleAutoCheck();
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
      scheduleAutoCheck();
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
    <div style={{ maxWidth: 950, margin: '20px auto', padding: spacing.lg, overflowX: 'auto' }} dir="rtl">
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.primary, marginBottom: spacing.sm }}>
        ← العودة إلى الأسابيع الدراسية
      </button>
      <h1 style={{ fontFamily: font.family, color: colors.ink }}>{week.name} — {TYPE_LABELS[week.type]}</h1>
      {week.enrichmentLink && !editingLink && (
        <p>
          <a href={week.enrichmentLink} target="_blank" rel="noreferrer" style={{ color: colors.primary }}>الرابط الإثرائي لهذا الأسبوع</a>
          {' '}
          <button onClick={() => { setLinkDraft(week.enrichmentLink); setEditingLink(true); }} style={{ background: 'none', border: 'none', color: colors.primary, fontSize: 12 }}>
            (تعديل)
          </button>
        </p>
      )}
      {!week.enrichmentLink && !editingLink && (
        <p>
          <button onClick={() => { setLinkDraft(''); setEditingLink(true); }} style={{ background: 'none', border: 'none', color: colors.primary, fontSize: 13 }}>
            + إضافة رابط إثرائي
          </button>
        </p>
      )}
      {editingLink && (
        <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.md }}>
          <input type="text" value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} placeholder="رابط إثرائي" style={{ flex: 1, padding: spacing.sm }} />
          <button onClick={handleSaveLink} disabled={savingLink} style={{ padding: '8px 14px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }}>
            {savingLink ? '...' : 'حفظ'}
          </button>
          <button onClick={() => setEditingLink(false)} style={{ padding: '8px 14px', background: '#f2f2f2', border: 'none', borderRadius: radius.button }}>
            إلغاء
          </button>
        </div>
      )}

      {error && <div style={{ background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.md }}>{error}</div>}
      {autoCheckNotice && (
        <div style={{ background: colors.primaryTint, color: '#0b5c33', padding: 10, borderRadius: radius.button, marginBottom: spacing.md, fontSize: 13 }}>
          ✓ تم فحص الإجراءات المتكررة تلقائيًا
        </div>
      )}

      <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.lg }}>
        <h3 style={{ marginTop: 0, fontFamily: font.family }}>إضافة مهارة جديدة</h3>
        <form onSubmit={handleAddSkill} style={{ display: 'flex', gap: spacing.sm }}>
          <input type="text" placeholder="اسم المهارة" value={skillTitle} onChange={(e) => setSkillTitle(e.target.value)} style={{ flex: 1, padding: spacing.sm }} required />
          <button type="submit" disabled={addingSkill} style={{ padding: '10px 16px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }}>
            {addingSkill ? '...' : 'إضافة'}
          </button>
        </form>
      </div>

      {students.length === 0 ? (
        <p style={{ color: colors.textMuted }}>لا توجد طالبات في هذا الفصل بعد.</p>
      ) : skills.length === 0 ? (
        <p style={{ color: colors.textMuted }}>لا توجد مهارات بهذا الأسبوع الدراسي بعد.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.sm, alignItems: 'center' }}>
            <button onClick={handleAutoFillMastered} disabled={autoFilling} style={{ padding: '8px 14px', background: colors.primaryTint, border: `1px solid ${colors.primary}`, color: '#0b5c33', borderRadius: radius.button, fontSize: 13 }}>
              {autoFilling ? '...' : 'توصيات تلقائية للمتقنات'}
            </button>
            <button onClick={handleCheckActions} disabled={checkingActions} style={{ padding: '8px 14px', background: colors.amberTint, border: `1px solid ${colors.amberBorder}`, color: colors.amber, borderRadius: radius.button, fontSize: 13 }}>
              {checkingActions ? '...' : 'فحص فوري الآن'}
            </button>
            <span style={{ fontSize: 11, color: colors.textMuted }}>الفحص يشتغل تلقائيًا بعد كل تحديث للتقييمات</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ padding: spacing.sm, textAlign: 'right', borderBottom: `2px solid ${colors.border}`, position: 'sticky', right: 0, background: '#fff' }}>الطالبة</th>
                {skills.map((s) => (
                  <th key={s.id} style={{ padding: spacing.sm, borderBottom: `2px solid ${colors.border}`, minWidth: 150 }}>
                    {editingSkillId === s.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <input
                          type="text"
                          value={editSkillTitleValue}
                          onChange={(e) => setEditSkillTitleValue(e.target.value)}
                          style={{ padding: 4, fontSize: 12, width: '100%', boxSizing: 'border-box' }}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => handleSaveSkillTitle(s.id)} disabled={savingSkillTitle} style={{ flex: 1, padding: '2px 6px', fontSize: 11, background: colors.primary, color: '#fff', border: 'none', borderRadius: 6 }}>
                            {savingSkillTitle ? '...' : 'حفظ'}
                          </button>
                          <button onClick={() => setEditingSkillId(null)} style={{ flex: 1, padding: '2px 6px', fontSize: 11, background: '#f2f2f2', border: 'none', borderRadius: 6 }}>
                            إلغاء
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontWeight: 'normal' }}>{s.title}</div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                          <button onClick={() => handleSetAllMastered(s.id)} style={{ padding: '2px 6px', fontSize: 10, background: colors.primaryTint, border: `1px solid ${colors.primary}`, color: '#0b5c33', borderRadius: 6 }}>
                            تعيين الكل: متقنة
                          </button>
                          <button onClick={() => startEditSkill(s)} style={{ padding: '2px 6px', fontSize: 10, background: '#f2f2f2', border: 'none', borderRadius: 6 }}>
                            تعديل
                          </button>
                          <button
                            onClick={() => handleDeleteSkill(s)}
                            disabled={deletingSkillId === s.id}
                            style={{ padding: '2px 6px', fontSize: 10, background: colors.redTint, border: `1px solid ${colors.redBorder}`, color: colors.red, borderRadius: 6 }}
                          >
                            {deletingSkillId === s.id ? '...' : 'حذف'}
                          </button>
                        </div>
                      </>
                    )}
                  </th>
                ))}
                <th style={{ padding: spacing.sm, borderBottom: `2px solid ${colors.border}`, minWidth: 200 }}>التوصية</th>
                <th style={{ padding: spacing.sm, borderBottom: `2px solid ${colors.border}`, minWidth: 150 }}>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const statuses = statusesForStudent(student.id);
                const fullyMastered = isFullyMastered(student.id);
                const relevantStatus = fullyMastered ? null : worstStatus(statuses);
                const options = relevantStatus ? (recommendationsByStatus[relevantStatus] || []) : [];
                return (
                  <tr key={student.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: spacing.sm, position: 'sticky', right: 0, background: '#fff' }}>{student.name}</td>
                    {skills.map((s) => {
                      const current = assessmentsBySkill[s.id]?.[student.id]?.status || '';
                      const statusColors = current ? STATUS_COLORS[current] : null;
                      return (
                        <td key={s.id} style={{ padding: 6, textAlign: 'center' }}>
                          <select
                            value={current}
                            onChange={(e) => handleStatusChange(s.id, student.id, e.target.value)}
                            style={{
                              padding: 4,
                              width: '100%',
                              background: statusColors ? statusColors.bg : '#fff',
                              color: statusColors ? statusColors.text : '#000',
                              border: statusColors ? `1px solid ${statusColors.border}` : '1px solid #ccc',
                              fontWeight: statusColors ? 'bold' : 'normal',
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
