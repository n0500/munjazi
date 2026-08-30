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
import { listSchoolTeachers } from '../lib/teachersApi';
import { listSchoolWeekNames, addSchoolWeekName, deleteSchoolWeekName } from '../lib/schoolWeekNamesApi';
import ClassDetail from './ClassDetail';

export default function AdminDashboard({ schoolId }) {
  const [school, setSchool] = useState(null);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [weekNames, setWeekNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const [className, setClassName] = useState('');
  const [creating, setCreating] = useState(false);

  const [newWeekName, setNewWeekName] = useState('');
  const [addingWeekName, setAddingWeekName] = useState(false);

  const [selectedClassId, setSelectedClassId] = useState(null);
  const [assignExpandedId, setAssignExpandedId] = useState(null);
  const [assignmentsByClass, setAssignmentsByClass] = useState({});
  const [assignTeacherUid, setAssignTeacherUid] = useState('');
  const [assignSubject, setAssignSubject] = useState('');
  const [assigning, setAssigning] = useState(false);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [schoolRow, classRows, teacherRows, weekNameRows] = await Promise.all([
        getSchool(schoolId),
        listClasses(schoolId),
        listSchoolTeachers(schoolId),
        listSchoolWeekNames(schoolId),
      ]);
      setSchool(schoolRow);
      setClasses(classRows);
      setTeachers(teacherRows);
      setWeekNames(weekNameRows);
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

  async function handleAddWeekName(e) {
    e.preventDefault();
    setError('');
    if (!newWeekName.trim() || addingWeekName) return;
    setAddingWeekName(true);
    try {
      await addSchoolWeekName(schoolId, newWeekName);
      setNewWeekName('');
      const rows = await listSchoolWeekNames(schoolId);
      setWeekNames(rows);
    } catch (err) {
      setError(err.message || 'تعذّر إضافة اسم الأسبوع.');
    } finally {
      setAddingWeekName(false);
    }
  }

  async function handleDeleteWeekName(id) {
    setError('');
    try {
      await deleteSchoolWeekName(schoolId, id);
      const rows = await listSchoolWeekNames(schoolId);
      setWeekNames(rows);
    } catch (err) {
      setError(err.message || 'تعذّر حذف اسم الأسبوع.');
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

  return (
    <div style={{ maxWidth: 600, margin: '20px auto', padding: 16 }} dir="rtl">
      <h1>{school?.name || 'لوحة الإدارة'}</h1>
      <p style={{ color: '#666' }}>
        رمز المدرسة: <strong style={{ fontFamily: 'monospace' }}>{school?.schoolCode}</strong> — يُرجى تسليمه للمعلّمات لإنشاء حساباتهن
      </p>

      <div style={{ marginBottom: 20 }}>
        <button onClick={handleCopyParentLink} style={{ padding: '10px 16px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
          نسخ رابط ولي الأمر
        </button>
        {linkCopied && <span style={{ marginRight: 10, color: '#0b5c33' }}>تم النسخ بنجاح ✅</span>}
      </div>

      {error && <div style={{ background: '#fdecea', color: '#a10000', padding: 10, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>أسماء الأسابيع الدراسية (موحّدة لكل المواد)</h3>
        <p style={{ fontSize: 12, color: '#888', marginTop: 0 }}>
          هذي القائمة تختار منها كل المعلّمات عند إنشاء أسبوع جديد، عشان تتوحّد الأسابيع بين كل المواد.
        </p>
        <form onSubmit={handleAddWeekName} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input type="text" placeholder="مثال: الأسبوع السادس" value={newWeekName} onChange={(e) => setNewWeekName(e.target.value)} style={{ flex: 1, padding: 10 }} required />
          <button type="submit" disabled={addingWeekName} style={{ padding: '10px 16px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
            {addingWeekName ? '...' : 'إضافة'}
          </button>
        </form>
        {weekNames.length === 0 ? (
          <p style={{ color: '#999', fontSize: 13 }}>لا توجد أسماء أسابيع بعد.</p>
        ) : (
          weekNames.map((w) => (
            <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f2f2f2' }}>
              <span style={{ fontSize: 14 }}>{w.name}</span>
              <button onClick={() => handleDeleteWeekName(w.id)} style={{ padding: '2px 8px', background: '#a10000', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12 }}>
                حذف
              </button>
            </div>
          ))
        )}
      </div>

      <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>إضافة فصل جديد</h3>
        <form onSubmit={handleCreateClass} style={{ display: 'flex', gap: 8 }}>
          <input type="text" placeholder="اسم الفصل" value={className} onChange={(e) => setClassName(e.target.value)} style={{ flex: 1, padding: 10 }} required />
          <button type="submit" disabled={creating} style={{ padding: '10px 16px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
            {creating ? '...' : 'إضافة'}
          </button>
        </form>
      </div>

      <h3>الفصول ({classes.length})</h3>
      {classes.length === 0 ? (
        <p style={{ color: '#666' }}>لا توجد فصول بعد.</p>
      ) : (
        classes.map((c) => (
          <div key={c.id} style={{ border: '1px solid #eee', borderRadius: 8, marginBottom: 10, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <button onClick={() => setSelectedClassId(c.id)} style={{ background: 'none', border: 'none', color: '#0b3d2e', fontWeight: 'bold', fontSize: 16, textAlign: 'right', cursor: 'pointer' }}>
                {c.name} {c.archived && <em style={{ color: '#a10000' }}>(مؤرشف)</em>}
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => toggleAssignExpand(c.id)} style={{ padding: '6px 12px', background: '#f2f2f2', border: 'none', borderRadius: 6 }}>
                  {assignExpandedId === c.id ? 'إخفاء المعلّمات' : 'إسناد معلّمة'}
                </button>
                <button onClick={() => handleToggleClass(c)} style={{ padding: '6px 12px', background: c.archived ? '#0b7a4b' : '#a10000', color: '#fff', border: 'none', borderRadius: 6 }}>
                  {c.archived ? 'إلغاء الأرشفة' : 'أرشفة'}
                </button>
              </div>
            </div>

            {assignExpandedId === c.id && (
              <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 10 }}>
                {(assignmentsByClass[c.id] || []).map((a) => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span>{a.teacherName} — {a.subject || 'بدون مادة'}</span>
                    <button onClick={() => handleRemoveAssignment(c.id, a.id)} style={{ padding: '2px 8px', background: '#a10000', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12 }}>
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
                  <button onClick={() => handleAssign(c.id)} disabled={assigning} style={{ padding: '6px 14px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 6 }}>
                    {assigning ? '...' : 'إسناد'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}

      <h3 style={{ marginTop: 24 }}>المعلّمات ({teachers.length})</h3>
      {teachers.length === 0 ? (
        <p style={{ color: '#666' }}>لا توجد معلّمات مسجَّلات بعد.</p>
      ) : (
        teachers.map((t) => (
          <div key={t.uid} style={{ padding: '8px 0', borderTop: '1px solid #eee' }}>
            {t.displayName} {t.disabled && <em style={{ color: '#a10000' }}>(معطّلة)</em>}
          </div>
        ))
      )}
    </div>
  );
}
