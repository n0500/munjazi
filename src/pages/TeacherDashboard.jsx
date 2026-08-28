import { useEffect, useState } from 'react';
import { listClasses, linkTeacherToClass, listTeacherAssignments, removeAssignment } from '../lib/classesApi';
import { listClassStudents } from '../lib/studentsApi';

export default function TeacherDashboard({ schoolId, teacherUid, teacherName }) {
  const [allClasses, setAllClasses] = useState([]);
  const [myAssignments, setMyAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [pickClassId, setPickClassId] = useState('');
  const [subject, setSubject] = useState('');
  const [linking, setLinking] = useState(false);

  const [openClassId, setOpenClassId] = useState(null);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [classRows, assignRows] = await Promise.all([
        listClasses(schoolId),
        listTeacherAssignments(schoolId, teacherUid),
      ]);
      setAllClasses(classRows);
      setMyAssignments(assignRows);
    } catch (err) {
      setError(err.message || 'تعذّر تحميل البيانات.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, teacherUid]);

  async function handleLink(e) {
    e.preventDefault();
    setError('');
    if (!pickClassId || linking) return;
    setLinking(true);
    try {
      await linkTeacherToClass(schoolId, pickClassId, teacherUid, teacherName, subject);
      setPickClassId('');
      setSubject('');
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر ربط الفصل.');
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink(assignmentId) {
    setError('');
    try {
      await removeAssignment(schoolId, assignmentId);
      if (openClassId) setOpenClassId(null);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر إزالة الربط.');
    }
  }

  async function openClass(classId) {
    if (openClassId === classId) {
      setOpenClassId(null);
      return;
    }
    setOpenClassId(classId);
    setStudentsLoading(true);
    try {
      const rows = await listClassStudents(schoolId, classId);
      setStudents(rows);
    } catch (err) {
      setError(err.message || 'تعذّر تحميل قائمة الطالبات.');
    } finally {
      setStudentsLoading(false);
    }
  }

  const classNameFor = (classId) => allClasses.find((c) => c.id === classId)?.name || '؟';
  const availableClasses = allClasses.filter((c) => !c.archived);

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جاري التحميل</p>;

  return (
    <div style={{ maxWidth: 600, margin: '20px auto', padding: 16 }} dir="rtl">
      <h1>لوحة المعلّمة</h1>

      {error && <div style={{ background: '#fdecea', color: '#a10000', padding: 10, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>ربط فصل جديد</h3>
        <form onSubmit={handleLink} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={pickClassId} onChange={(e) => setPickClassId(e.target.value)} style={{ flex: 1, padding: 10, minWidth: 140 }} required>
            <option value="">اختاري فصل</option>
            {availableClasses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input type="text" placeholder="المادة (مثلاً: لغة إنجليزية)" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ flex: 1, padding: 10, minWidth: 140 }} />
          <button type="submit" disabled={linking} style={{ padding: '10px 16px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
            {linking ? '...' : 'ربط'}
          </button>
        </form>
      </div>

      <h3>فصولي ({myAssignments.length})</h3>
      {myAssignments.length === 0 ? (
        <p style={{ color: '#666' }}>ما ربطتِ نفسك بأي فصل بعد.</p>
      ) : (
        myAssignments.map((a) => (
          <div key={a.id} style={{ border: '1px solid #eee', borderRadius: 8, marginBottom: 10, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => openClass(a.classId)} style={{ background: 'none', border: 'none', color: '#0b3d2e', fontWeight: 'bold', fontSize: 16, cursor: 'pointer' }}>
                {classNameFor(a.classId)} — {a.subject || 'بدون مادة'}
              </button>
              <button onClick={() => handleUnlink(a.id)} style={{ padding: '4px 10px', background: '#a10000', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13 }}>
                إزالة
              </button>
            </div>

            {openClassId === a.classId && (
              <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 10 }}>
                {studentsLoading ? (
                  <p>...جاري التحميل</p>
                ) : students.length === 0 ? (
                  <p style={{ color: '#666', fontSize: 14 }}>ما فيه طالبات بهذا الفصل بعد.</p>
                ) : (
                  students.map((s) => (
                    <div key={s.id} style={{ padding: '4px 0' }}>{s.name}</div>
                  ))
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
