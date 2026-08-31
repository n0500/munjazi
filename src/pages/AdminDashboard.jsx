import { useEffect, useState } from 'react';
import { getSchool } from '../lib/schoolsApi';
import {
  listClasses,
  createClass,
  setClassArchived,
  linkTeacherToClass,
  listClassAssignments,
  removeAssignment,
} from '../lib/classesApi';
import { listSchoolTeachers, setTeacherDisabled } from '../lib/teachersApi';
import { listClassStudents } from '../lib/studentsApi';
import ClassDetail from './ClassDetail';
import { colors, font, radius, spacing } from '../lib/theme';

const TABS = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'classes', label: 'الفصول والطالبات' },
  { key: 'teachers', label: 'المعلمات' },
  { key: 'tracking', label: 'متابعة الرصد' },
];

export default function AdminDashboard({ schoolId }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [school, setSchool] = useState(null);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [studentCounts, setStudentCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const [className, setClassName] = useState('');
  const [creating, setCreating] = useState(false);

  const [selectedClassId, setSelectedClassId] = useState(null);
  const [assignExpandedId, setAssignExpandedId] = useState(null);
  const [assignmentsByClass, setAssignmentsByClass] = useState({});
  const [assignTeacherUid, setAssignTeacherUid] = useState('');
  const [assignSubject, setAssignSubject] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [togglingTeacherUid, setTogglingTeacherUid] = useState(null);
  const [confirmDisableUid, setConfirmDisableUid] = useState(null);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [schoolRow, classRows, teacherRows] = await Promise.all([
        getSchool(schoolId),
        listClasses(schoolId),
        listSchoolTeachers(schoolId),
      ]);
      setSchool(schoolRow);
      setClasses(classRows);
      setTeachers(teacherRows);

      const countsEntries = await Promise.all(
        classRows.map(async (c) => {
          const students = await listClassStudents(schoolId, c.id);
          return [c.id, students.length];
        }),
      );
      setStudentCounts(Object.fromEntries(countsEntries));

      const assignmentsEntries = await Promise.all(
        classRows.map((c) => listClassAssignments(schoolId, c.id)),
      );
      setAssignments(assignmentsEntries.flat());
    } catch (err) {
      setError(err.message || 'تعذّر تحميل بيانات المدرسة.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  async function handleCreateClass(e) {
    e.preventDefault();
    setError('');
    if (!className.trim() || creating) return;
    setCreating(true);
    try {
      await createClass(schoolId, className);
      setClassName('');
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر إنشاء الفصل.');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleClass(cls) {
    setError('');
    try {
      await setClassArchived(schoolId, cls.id, !cls.archived);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر تحديث حالة الفصل.');
    }
  }

  async function toggleAssignExpand(classId) {
    if (assignExpandedId === classId) {
      setAssignExpandedId(null);
      return;
    }
    setAssignExpandedId(classId);
    setAssignTeacherUid('');
    setAssignSubject('');
    if (!assignmentsByClass[classId]) {
      try {
        const rows = await listClassAssignments(schoolId, classId);
        setAssignmentsByClass((prev) => ({ ...prev, [classId]: rows }));
      } catch (err) {
        setError(err.message || 'تعذّر تحميل الإسنادات.');
      }
    }
  }

  async function handleAssign(classId) {
    setError('');
    if (!assignTeacherUid || assigning) return;
    setAssigning(true);
    try {
      const teacher = teachers.find((t) => t.uid === assignTeacherUid);
      await linkTeacherToClass(schoolId, classId, assignTeacherUid, teacher?.displayName, assignSubject);
      setAssignTeacherUid('');
      setAssignSubject('');
      const rows = await listClassAssignments(schoolId, classId);
      setAssignmentsByClass((prev) => ({ ...prev, [classId]: rows }));
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر إسناد المعلّمة.');
    } finally {
      setAssigning(false);
    }
  }

  async function handleRemoveAssignment(classId, assignmentId) {
    setError('');
    try {
      await removeAssignment(schoolId, assignmentId);
      const rows = await listClassAssignments(schoolId, classId);
      setAssignmentsByClass((prev) => ({ ...prev, [classId]: rows }));
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر إزالة الإسناد.');
    }
  }

  function handleCopyParentLink() {
    const link = `${window.location.origin}${window.location.pathname}?role=parent`;
    navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 3000);
  }

  function assignedClassesCountFor(teacherUid) {
    return assignments.filter((a) => a.teacherUid === teacherUid).length;
  }

  function handleToggleTeacherClick(teacher) {
    const willDisable = !teacher.disabled;
    const hasAssignments = assignedClassesCountFor(teacher.uid) > 0;
    if (willDisable && hasAssignments) {
      setConfirmDisableUid(teacher.uid);
      return;
    }
    performToggleTeacher(teacher);
  }

  async function performToggleTeacher(teacher) {
    setError('');
    setConfirmDisableUid(null);
    setTogglingTeacherUid(teacher.uid);
    try {
      await setTeacherDisabled(teacher.uid, !teacher.disabled);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر تحديث حالة حساب المعلّمة.');
    } finally {
      setTogglingTeacherUid(null);
    }
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  if (selectedClassId) {
    return (
      <ClassDetail
        schoolId={schoolId}
        classId={selectedClassId}
        allClasses={classes}
        onBack={() => { setSelectedClassId(null); refresh(); }}
      />
    );
  }

  const activeClasses = classes.filter((c) => !c.archived);
  const archivedClasses = classes.filter((c) => c.archived);
  const activeTeachers = teachers.filter((t) => !t.disabled);
  const disabledTeachers = teachers.filter((t) => t.disabled);
  const totalStudents = Object.values(studentCounts).reduce((sum, n) => sum + n, 0);

  return (
    <div style={{ maxWidth: 700, margin: '20px auto', padding: spacing.lg }} dir="rtl">
      <h1 style={{ fontFamily: font.family, color: colors.ink }}>{school?.name || 'لوحة الإدارة'}</h1>

      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: `1px solid ${colors.border}`, marginBottom: spacing.xl }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t.key ? `2px solid ${colors.primary}` : '2px solid transparent',
              color: activeTab === t.key ? colors.primary : colors.textMuted,
              fontFamily: font.family,
              fontWeight: activeTab === t.key ? font.weightMedium : font.weightRegular,
              fontSize: 14,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div style={{ background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.md }}>{error}</div>}

      {activeTab === 'overview' && (
        <>
          <p style={{ color: colors.textMuted }}>
            رمز المدرسة: <strong style={{ fontFamily: 'monospace' }}>{school?.schoolCode}</strong> — يُرجى تسليمه للمعلّمات لإنشاء حساباتهن
          </p>

          <div style={{ marginBottom: spacing.xl }}>
            <button onClick={handleCopyParentLink} style={{ padding: '10px 16px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }}>
              نسخ رابط ولي الأمر
            </button>
            {linkCopied && <span style={{ marginRight: 10, color: '#0b5c33' }}>تم النسخ بنجاح ✅</span>}
          </div>

          <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 140px', border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.md, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: colors.ink }}>{activeClasses.length}</div>
              <div style={{ fontSize: 12, color: colors.textMuted }}>فصل نشط</div>
              {archivedClasses.length > 0 && <div style={{ fontSize: 11, color: colors.textMuted }}>({archivedClasses.length} مؤرشف)</div>}
            </div>
            <div style={{ flex: '1 1 140px', border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.md, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: colors.ink }}>{totalStudents}</div>
              <div style={{ fontSize: 12, color: colors.textMuted }}>طالبة إجمالًا</div>
            </div>
            <div style={{ flex: '1 1 140px', border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.md, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: colors.ink }}>{activeTeachers.length}</div>
              <div style={{ fontSize: 12, color: colors.textMuted }}>معلّمة نشطة</div>
              {disabledTeachers.length > 0 && <div style={{ fontSize: 11, color: colors.textMuted }}>({disabledTeachers.length} معطّلة)</div>}
            </div>
          </div>
        </>
      )}

      {activeTab === 'classes' && (
        <>
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.xl }}>
            <h3 style={{ marginTop: 0, fontFamily: font.family }}>إضافة فصل جديد</h3>
            <form onSubmit={handleCreateClass} style={{ display: 'flex', gap: spacing.sm }}>
              <input type="text" placeholder="اسم الفصل" value={className} onChange={(e) => setClassName(e.target.value)} style={{ flex: 1, padding: spacing.sm }} required />
              <button type="submit" disabled={creating} style={{ padding: '10px 16px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }}>
                {creating ? '...' : 'إضافة'}
              </button>
            </form>
          </div>

          <h3 style={{ fontFamily: font.family }}>الفصول ({classes.length})</h3>
          {classes.length === 0 ? (
            <p style={{ color: colors.textMuted }}>لا توجد فصول بعد.</p>
          ) : (
            classes.map((c) => (
              <div key={c.id} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.button, marginBottom: 10, padding: spacing.md }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <button onClick={() => setSelectedClassId(c.id)} style={{ background: 'none', border: 'none', color: colors.ink, fontWeight: 'bold', fontSize: 16, textAlign: 'right', cursor: 'pointer', fontFamily: font.family }}>
                    {c.name} {c.archived && <em style={{ color: colors.red }}>(مؤرشف)</em>}
                  </button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => toggleAssignExpand(c.id)} style={{ padding: '6px 12px', background: '#f2f2f2', border: 'none', borderRadius: 6 }}>
                      {assignExpandedId === c.id ? 'إخفاء المعلّمات' : 'إسناد معلّمة'}
                    </button>
                    <button onClick={() => handleToggleClass(c)} style={{ padding: '6px 12px', background: c.archived ? colors.primary : colors.red, color: '#fff', border: 'none', borderRadius: 6 }}>
                      {c.archived ? 'إلغاء الأرشفة' : 'أرشفة'}
                    </button>
                  </div>
                </div>

                {assignExpandedId === c.id && (
                  <div style={{ marginTop: spacing.sm, borderTop: `1px solid ${colors.border}`, paddingTop: spacing.sm }}>
                    {(assignmentsByClass[c.id] || []).map((a) => (
                      <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span>{a.teacherName} — {a.subject || 'بدون مادة'}</span>
                        <button onClick={() => handleRemoveAssignment(c.id, a.id)} style={{ padding: '2px 8px', background: colors.red, color: '#fff', border: 'none', borderRadius: 6, fontSize: 12 }}>
                          إزالة
                        </button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <select value={assignTeacherUid} onChange={(e) => setAssignTeacherUid(e.target.value)} style={{ flex: 1, padding: 6, minWidth: 140 }}>
                        <option value="">اختيار معلّمة</option>
                        {teachers.map((t) => (
                          <option key={t.uid} value={t.uid}>{t.displayName}</option>
                        ))}
                      </select>
                      <input type="text" placeholder="المادة" value={assignSubject} onChange={(e) => setAssignSubject(e.target.value)} style={{ flex: 1, padding: 6, minWidth: 100 }} />
                      <button onClick={() => handleAssign(c.id)} disabled={assigning} style={{ padding: '6px 14px', background: colors.primary, color: '#fff', border: 'none', borderRadius: 6 }}>
                        {assigning ? '...' : 'إسناد'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}

      {activeTab === 'teachers' && (
        <>
          <h3 style={{ fontFamily: font.family }}>المعلّمات ({teachers.length})</h3>
          {teachers.length === 0 ? (
            <p style={{ color: colors.textMuted }}>لا توجد معلّمات مسجَّلات بعد.</p>
          ) : (
            teachers.map((t) => {
              const assignedCount = assignedClassesCountFor(t.uid);
              return (
                <div key={t.uid} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.md, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontFamily: font.family }}>
                        {t.displayName} {t.disabled && <em style={{ color: colors.red, fontWeight: 'normal' }}>(معطّلة)</em>}
                      </div>
                      <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                        {assignedCount > 0 ? `مسندة إلى ${assignedCount} فصل` : 'غير مسندة إلى أي فصل حاليًا'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleTeacherClick(t)}
                      disabled={togglingTeacherUid === t.uid}
                      style={{
                        padding: '6px 14px',
                        background: t.disabled ? colors.primary : colors.red,
                        color: '#fff',
                        border: 'none',
                        borderRadius: radius.button,
                        fontSize: 13,
                      }}
                    >
                      {togglingTeacherUid === t.uid ? '...' : t.disabled ? 'تفعيل الحساب' : 'تعطيل الحساب'}
                    </button>
                  </div>

                  {confirmDisableUid === t.uid && (
                    <div style={{ marginTop: spacing.sm, background: colors.amberTint, border: `1px solid ${colors.amberBorder}`, borderRadius: radius.button, padding: spacing.sm, fontSize: 13, color: colors.amber }}>
                      هذه المعلّمة مسندة حاليًا إلى {assignedCount} {assignedCount === 1 ? 'فصل' : 'فصول'}. يُرجى التأكد من نقل الإسناد إلى معلّمة أخرى إن دعت الحاجة قبل المتابعة.
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={() => performToggleTeacher(t)} style={{ padding: '5px 12px', background: colors.red, color: '#fff', border: 'none', borderRadius: 6, fontSize: 12 }}>
                          تعطيل الحساب مع ذلك
                        </button>
                        <button onClick={() => setConfirmDisableUid(null)} style={{ padding: '5px 12px', background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 12 }}>
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </>
      )}

      {activeTab === 'tracking' && (
        <p style={{ color: colors.textMuted }}>سيُضاف قريبًا: متابعة حالة الرصد الأسبوعي لكل فصل، والمستوى العام، وروابط سريعة للتقارير.</p>
      )}
    </div>
  );
}
