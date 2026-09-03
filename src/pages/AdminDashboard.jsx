import { useEffect, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { getSchool } from '../lib/schoolsApi';
import {
  listClasses,
  createClass,
  updateClassName,
  deleteClassIfEmpty,
  setClassArchived,
  linkTeacherToClass,
  listClassAssignments,
  removeAssignment,
} from '../lib/classesApi';
import { listSchoolTeachers } from '../lib/teachersApi';
import { listClassStudents } from '../lib/studentsApi';
import { getLatestWeekSummaryLight } from '../lib/overviewApi';
import { listActionsForClass } from '../lib/actionEngine';
import ClassDetail from './ClassDetail';
import ClassReport from './ClassReport';
import PendingAckReportDocument from './PendingAckReportDocument';
import { colors, font, radius, spacing } from '../lib/theme';

const TABS = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'classes', label: 'الفصول والطالبات' },
  { key: 'teachers', label: 'المعلمات' },
  { key: 'tracking', label: 'متابعة الرصد' },
  { key: 'pendingAck', label: 'اطلاع أولياء الأمور' },
];

function daysSince(timestamp) {
  if (!timestamp?.seconds) return null;
  const ms = Date.now() - timestamp.seconds * 1000;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function formatDaysAgo(days) {
  if (days === null) return '—';
  if (days === 0) return 'اليوم';
  if (days === 1) return 'منذ يوم واحد';
  if (days === 2) return 'منذ يومين';
  if (days <= 10) return `منذ ${days} أيام`;
  return `منذ ${days} يومًا`;
}

function formatDate(value) {
  if (!value) return '—';
  try {
    const date = value.toDate ? value.toDate() : new Date(value);
    return date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

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

  const [editingClassId, setEditingClassId] = useState(null);
  const [editClassNameValue, setEditClassNameValue] = useState('');
  const [savingClassName, setSavingClassName] = useState(false);
  const [deletingClassId, setDeletingClassId] = useState(null);

  const [trackingRows, setTrackingRows] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);

  const [pendingAckScope, setPendingAckScope] = useState('all');
  const [pendingAckGenerating, setPendingAckGenerating] = useState(false);

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

  async function loadTracking() {
    setTrackingLoading(true);
    setError('');
    try {
      const classNameFor = (classId) => classes.find((c) => c.id === classId)?.name || '؟';

      const rows = await Promise.all(
        assignments.map(async (a) => {
          const [summary, classActions] = await Promise.all([
            getLatestWeekSummaryLight(schoolId, a.classId, a.teacherUid),
            listActionsForClass(schoolId, a.classId),
          ]);

          const daysAgo = summary ? daysSince(summary.createdAt) : null;

          let masteryPercent = null;
          if (summary) {
            const total = Object.values(summary.counts).reduce((s, n) => s + n, 0);
            if (total > 0) masteryPercent = Math.round((summary.counts.mastered / total) * 100);
          }

          const activeActionsCount = classActions.filter(
            (act) => act.teacherUid === a.teacherUid && act.status === 'active',
          ).length;

          return {
            assignmentId: a.id,
            classId: a.classId,
            className: classNameFor(a.classId),
            teacherUid: a.teacherUid,
            teacherName: a.teacherName,
            subject: a.subject || 'بدون مادة',
            weekName: summary?.weekName || null,
            daysAgo,
            masteryPercent,
            activeActionsCount,
          };
        }),
      );

      rows.sort((a, b) => {
        const aStale = a.daysAgo === null ? 9999 : a.daysAgo;
        const bStale = b.daysAgo === null ? 9999 : b.daysAgo;
        if (aStale !== bStale) return bStale - aStale;
        const aMastery = a.masteryPercent === null ? -1 : a.masteryPercent;
        const bMastery = b.masteryPercent === null ? -1 : b.masteryPercent;
        return aMastery - bMastery;
      });

      setTrackingRows(rows);
    } catch (err) {
      setError(err.message || 'تعذّر تحميل بيانات المتابعة.');
    } finally {
      setTrackingLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'tracking' && trackingRows === null && !loading) {
      loadTracking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loading]);

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

  function startEditClassName(cls) {
    setEditingClassId(cls.id);
    setEditClassNameValue(cls.name);
  }

  async function handleSaveClassName(classId) {
    setError('');
    setSavingClassName(true);
    try {
      await updateClassName(schoolId, classId, editClassNameValue);
      setEditingClassId(null);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر تعديل اسم الفصل.');
    } finally {
      setSavingClassName(false);
    }
  }

  async function handleDeleteClass(cls) {
    if (!window.confirm(`سيتم حذف الفصل "${cls.name}" نهائيًا، ولا يمكن التراجع عن هذا الإجراء. هل الرغبة في المتابعة مؤكدة؟`)) return;
    setError('');
    setDeletingClassId(cls.id);
    try {
      await deleteClassIfEmpty(schoolId, cls.id);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر حذف الفصل.');
    } finally {
      setDeletingClassId(null);
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
      setTrackingRows(null);
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
      setTrackingRows(null);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذر إزالة الإسناد.');
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

  function classAssignmentsCountFor(classId) {
    return assignments.filter((a) => a.classId === classId).length;
  }

  const classNameFor = (classId) => classes.find((c) => c.id === classId)?.name || '؟';

  async function handleGeneratePendingAckReport() {
    setError('');
    setPendingAckGenerating(true);
    try {
      const targetClassIds = pendingAckScope === 'all'
        ? [...new Set(assignments.map((a) => a.classId))]
        : [pendingAckScope];

      const actionsPerClass = await Promise.all(
        targetClassIds.map((classId) => listActionsForClass(schoolId, classId)),
      );
      const allActions = actionsPerClass.flat();

      const pendingRemedial = allActions.filter(
        (a) => a.type === 'remedial' && a.status === 'active' && !a.parentAcknowledgment?.viewedAt,
      );

      const rows = pendingRemedial.map((a) => {
        const assignment = assignments.find((x) => x.classId === a.classId && x.teacherUid === a.teacherUid);
        return {
          studentName: a.studentName,
          teacherName: assignment?.teacherName || teachers.find((t) => t.uid === a.teacherUid)?.displayName || '؟',
          subject: assignment?.subject || 'بدون مادة',
          className: classNameFor(a.classId),
          skillTitles: (a.affectedSkillTitles || []).join('، '),
          activatedDate: formatDate(a.activatedAt),
          repeated: (a.followUpLog?.length || 0) > 0,
        };
      });

      rows.sort((a, b) => (b.repeated === a.repeated ? 0 : b.repeated ? 1 : -1));

      const scopeLabel = pendingAckScope === 'all' ? 'المدرسة بالكامل' : `فصل: ${classNameFor(pendingAckScope)}`;
      const generatedDate = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });

      const blob = await pdf(
        <PendingAckReportDocument
          rows={rows}
          schoolName={school?.name || ''}
          scopeLabel={scopeLabel}
          generatedDate={generatedDate}
        />,
      ).toBlob();
      await downloadBlob(blob, `تقرير-اطلاع-أولياء-الأمور-${pendingAckScope === 'all' ? 'كامل-المدرسة' : classNameFor(pendingAckScope)}.pdf`);
    } catch (err) {
      setError(err.message || 'تعذّر توليد التقرير.');
    } finally {
      setPendingAckGenerating(false);
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

  if (reportTarget) {
    return (
      <ClassReport
        schoolId={schoolId}
        classId={reportTarget.classId}
        teacherUid={reportTarget.teacherUid}
        className={reportTarget.className}
        subject={reportTarget.subject}
        teacherName={reportTarget.teacherName}
        defaultWeekName={reportTarget.weekName}
        onBack={() => setReportTarget(null)}
      />
    );
  }

  const activeClasses = classes.filter((c) => !c.archived);
  const archivedClasses = classes.filter((c) => c.archived);
  const totalStudents = Object.values(studentCounts).reduce((sum, n) => sum + n, 0);

  const staleCount = trackingRows ? trackingRows.filter((r) => r.daysAgo === null || r.daysAgo > 7).length : 0;
  const highActionsCount = trackingRows ? trackingRows.filter((r) => r.activeActionsCount > 0).length : 0;

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
              <div style={{ fontSize: 22, fontWeight: 'bold', color: colors.ink }}>{teachers.length}</div>
              <div style={{ fontSize: 12, color: colors.textMuted }}>معلّمة مسجَّلة</div>
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
            classes.map((c) => {
              const isEmpty = (studentCounts[c.id] || 0) === 0 && classAssignmentsCountFor(c.id) === 0;
              const isEditing = editingClassId === c.id;
              return (
                <div key={c.id} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.button, marginBottom: 10, padding: spacing.md }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={editClassNameValue}
                        onChange={(e) => setEditClassNameValue(e.target.value)}
                        style={{ flex: 1, padding: 8, minWidth: 140 }}
                        autoFocus
                      />
                      <button onClick={() => handleSaveClassName(c.id)} disabled={savingClassName} style={{ padding: '6px 12px', background: colors.primary, color: '#fff', border: 'none', borderRadius: 6 }}>
                        {savingClassName ? '...' : 'حفظ'}
                      </button>
                      <button onClick={() => setEditingClassId(null)} style={{ padding: '6px 12px', background: '#f2f2f2', border: 'none', borderRadius: 6 }}>
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <button onClick={() => setSelectedClassId(c.id)} style={{ background: 'none', border: 'none', color: colors.ink, fontWeight: 'bold', fontSize: 16, textAlign: 'right', cursor: 'pointer', fontFamily: font.family }}>
                        {c.name} {c.archived && <em style={{ color: colors.red }}>(مؤرشف)</em>}
                      </button>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => startEditClassName(c)} style={{ padding: '6px 12px', background: '#f2f2f2', border: 'none', borderRadius: 6 }}>
                          تعديل الاسم
                        </button>
                        <button onClick={() => toggleAssignExpand(c.id)} style={{ padding: '6px 12px', background: '#f2f2f2', border: 'none', borderRadius: 6 }}>
                          {assignExpandedId === c.id ? 'إخفاء المعلّمات' : 'إسناد معلّمة'}
                        </button>
                        <button onClick={() => handleToggleClass(c)} style={{ padding: '6px 12px', background: c.archived ? colors.primary : colors.red, color: '#fff', border: 'none', borderRadius: 6 }}>
                          {c.archived ? 'إلغاء الأرشفة' : 'أرشفة'}
                        </button>
                        {isEmpty && (
                          <button
                            onClick={() => handleDeleteClass(c)}
                            disabled={deletingClassId === c.id}
                            style={{ padding: '6px 12px', background: colors.red, color: '#fff', border: 'none', borderRadius: 6 }}
                          >
                            {deletingClassId === c.id ? '...' : 'حذف'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {!isEditing && assignExpandedId === c.id && (
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
              );
            })
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
                  <div style={{ fontWeight: 'bold', fontFamily: font.family }}>{t.displayName}</div>
                  <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                    {assignedCount > 0 ? `مسندة إلى ${assignedCount} فصل` : 'غير مسندة إلى أي فصل حاليًا'}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {activeTab === 'tracking' && (
        <>
          {trackingLoading || trackingRows === null ? (
            <p style={{ textAlign: 'center', color: colors.textMuted, marginTop: 30 }}>...جارٍ تحميل بيانات المتابعة</p>
          ) : trackingRows.length === 0 ? (
            <p style={{ color: colors.textMuted }}>لا توجد إسنادات معلّمات حاليًا لمتابعتها.</p>
          ) : (
            <>
              <p style={{ fontSize: 14, color: colors.ink, marginBottom: spacing.lg }}>
                {staleCount > 0 && `${staleCount} من ${trackingRows.length} فصلًا لم يُرصد خلال الأسبوع الماضي`}
                {staleCount > 0 && highActionsCount > 0 && '، و'}
                {highActionsCount > 0 && `${highActionsCount} فصلًا فيه إجراءات نشطة تحتاج متابعة`}
                {staleCount === 0 && highActionsCount === 0 && 'جميع الفصول مرصودة بانتظام، ولا توجد إجراءات نشطة تستدعي الانتباه حاليًا'}
              </p>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right', borderBottom: `2px solid ${colors.border}`, padding: 8 }}>الفصل</th>
                    <th style={{ textAlign: 'right', borderBottom: `2px solid ${colors.border}`, padding: 8 }}>المعلّمة</th>
                    <th style={{ textAlign: 'right', borderBottom: `2px solid ${colors.border}`, padding: 8 }}>آخر رصد</th>
                    <th style={{ textAlign: 'right', borderBottom: `2px solid ${colors.border}`, padding: 8 }}>المستوى العام</th>
                    <th style={{ textAlign: 'right', borderBottom: `2px solid ${colors.border}`, padding: 8 }}>إجراءات نشطة</th>
                    <th style={{ textAlign: 'right', borderBottom: `2px solid ${colors.border}`, padding: 8 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {trackingRows.map((r) => {
                    const isStale = r.daysAgo === null || r.daysAgo > 7;
                    return (
                      <tr key={r.assignmentId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: 8 }}>{r.className}</td>
                        <td style={{ padding: 8 }}>{r.teacherName} <span style={{ color: colors.textMuted }}>({r.subject})</span></td>
                        <td style={{ padding: 8, color: isStale ? colors.red : colors.text }}>
                          {r.weekName ? `${r.weekName} · ${formatDaysAgo(r.daysAgo)}` : 'لم يبدأ الرصد بعد'}
                        </td>
                        <td style={{ padding: 8 }}>
                          {r.masteryPercent === null ? '—' : (
                            <span style={{ color: r.masteryPercent >= 70 ? '#0b5c33' : r.masteryPercent >= 40 ? colors.amber : colors.red, fontWeight: 'bold' }}>
                              {r.masteryPercent}٪ متقنة
                            </span>
                          )}
                        </td>
                        <td style={{ padding: 8 }}>
                          {r.activeActionsCount > 0 ? (
                            <span style={{ color: colors.amber }}>⚠ {r.activeActionsCount}</span>
                          ) : (
                            <span style={{ color: colors.textMuted }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: 8 }}>
                          <button
                            onClick={() => setReportTarget({ classId: r.classId, teacherUid: r.teacherUid, className: r.className, subject: r.subject, teacherName: r.teacherName, weekName: r.weekName })}
                            disabled={!r.weekName}
                            style={{ padding: '4px 10px', background: '#f2f2f2', border: 'none', borderRadius: 6, fontSize: 12, opacity: r.weekName ? 1 : 0.5 }}
                          >
                            تقرير
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </>
      )}

      {activeTab === 'pendingAck' && (
        <>
          <p style={{ color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg }}>
            يولّد هذا القسم تقرير PDF بأسماء الطالبات اللواتي لديهن إجراء علاجي نشط، ولم يطّلع ولي أمرهن عليه بعد — عبر جميع المعلمات والفصول.
          </p>
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.lg }}>
            <label>النطاق</label>
            <select value={pendingAckScope} onChange={(e) => setPendingAckScope(e.target.value)} style={{ width: '100%', padding: spacing.sm, marginBottom: spacing.md }}>
              <option value="all">المدرسة بالكامل</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={handleGeneratePendingAckReport}
              disabled={pendingAckGenerating}
              style={{ padding: '10px 16px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }}
            >
              {pendingAckGenerating ? '...جارٍ التوليد' : 'توليد التقرير وتحميله'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
