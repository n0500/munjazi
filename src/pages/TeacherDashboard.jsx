import { useEffect, useState } from 'react';
import { listClasses, linkTeacherToClass, listTeacherAssignments, removeAssignment } from '../lib/classesApi';
import ClassWeeks from './ClassWeeks';
import RecommendationsLibrary from './RecommendationsLibrary';
import TeacherOverview from './TeacherOverview';
import RemediationPlans from './RemediationPlans';
import AckTracking from './AckTracking';

export default function TeacherDashboard({ schoolId, teacherUid, teacherName }) {
  const [allClasses, setAllClasses] = useState([]);
  const [myAssignments, setMyAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [pickClassId, setPickClassId] = useState('');
  const [subject, setSubject] = useState('');
  const [linking, setLinking] = useState(false);

  const [openClassId, setOpenClassId] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [showAckTracking, setShowAckTracking] = useState(false);

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
      setError(err.message || 'تعذّر ربط الفصل الدراسي.');
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink(assignmentId) {
    setError('');
    try {
      await removeAssignment(schoolId, assignmentId);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر إزالة الربط.');
    }
  }

  const classNameFor = (classId) => allClasses.find((c) => c.id === classId)?.name || '؟';
  const availableClasses = allClasses.filter((c) => !c.archived);

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  if (showOverview) {
    return <TeacherOverview schoolId={schoolId} teacherUid={teacherUid} onBack={() => setShowOverview(false)} />;
  }

  if (showPlans) {
    return (
      <RemediationPlans
        schoolId={schoolId}
        teacherUid={teacherUid}
        teacherName={teacherName}
        onBack={() => setShowPlans(false)}
      />
    );
  }

  if (showAckTracking) {
    return (
      <AckTracking
        schoolId={schoolId}
        teacherUid={teacherUid}
        onBack={() => setShowAckTracking(false)}
      />
    );
  }

  if (showLibrary) {
    return (
      <RecommendationsLibrary
        schoolId={schoolId}
        teacherUid={teacherUid}
        onBack={() => setShowLibrary(false)}
      />
    );
  }

  if (openClassId) {
    const assignment = myAssignments.find((a) => a.classId === openClassId);
    return (
      <ClassWeeks
        schoolId={schoolId}
        classId={openClassId}
        teacherUid={teacherUid}
        teacherName={teacherName}
        className={classNameFor(openClassId)}
        subject={assignment?.subject || ''}
        onBack={() => setOpenClassId(null)}
      />
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: '20px auto', padding: 16 }} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1>لوحة المعلّمة</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setShowOverview(true)} style={{ padding: '8px 14px', background: '#f2f2f2', border: 'none', borderRadius: 8, fontSize: 13 }}>
            نظرة عامة
          </button>
          <button onClick={() => setShowPlans(true)} style={{ padding: '8px 14px', background: '#f2f2f2', border: 'none', borderRadius: 8, fontSize: 13 }}>
            الخطط العلاجية
          </button>
          <button onClick={() => setShowAckTracking(true)} style={{ padding: '8px 14px', background: '#f2f2f2', border: 'none', borderRadius: 8, fontSize: 13 }}>
            متابعة الاطلاع
          </button>
          <button onClick={() => setShowLibrary(true)} style={{ padding: '8px 14px', background: '#f2f2f2', border: 'none', borderRadius: 8, fontSize: 13 }}>
            مكتبة التوصيات
          </button>
        </div>
      </div>

      {error && <div style={{ background: '#fdecea', color: '#a10000', padding: 10, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>ربط فصل دراسي جديد</h3>
        <form onSubmit={handleLink} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={pickClassId} onChange={(e) => setPickClassId(e.target.value)} style={{ flex: 1, padding: 10, minWidth: 140 }} required>
            <option value="">اختيار فصل</option>
            {availableClasses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input type="text" placeholder="المادة الدراسية (مثال: اللغة الإنجليزية)" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ flex: 1, padding: 10, minWidth: 140 }} />
          <button type="submit" disabled={linking} style={{ padding: '10px 16px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
            {linking ? '...' : 'ربط'}
          </button>
        </form>
      </div>

      <h3>الفصول الدراسية ({myAssignments.length})</h3>
      {myAssignments.length === 0 ? (
        <p style={{ color: '#666' }}>لم يتم ربط أي فصل دراسي بعد.</p>
      ) : (
        myAssignments.map((a) => (
          <div key={a.id} style={{ border: '1px solid #eee', borderRadius: 8, marginBottom: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={() => setOpenClassId(a.classId)} style={{ background: 'none', border: 'none', color: '#0b3d2e', fontWeight: 'bold', fontSize: 16, cursor: 'pointer' }}>
              {classNameFor(a.classId)} — {a.subject || 'دون تحديد مادة'}
            </button>
            <button onClick={() => handleUnlink(a.id)} style={{ padding: '4px 10px', background: '#a10000', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13 }}>
              إزالة
            </button>
          </div>
        ))
      )}
    </div>
  );
}
