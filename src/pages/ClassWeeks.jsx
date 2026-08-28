import { useEffect, useState } from 'react';
import { listWeeksForClass, createWeek, copyWeek } from '../lib/weeksApi';
import WeekDetail from './WeekDetail';
import StudentReport from './StudentReport';
import ClassReport from './ClassReport';

const TYPE_LABELS = { measurement: 'قياس', remediation: 'معالجة' };

export default function ClassWeeks({ schoolId, classId, teacherUid, teacherName, className, subject, onBack }) {
  const [weeks, setWeeks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [type, setType] = useState('measurement');
  const [enrichmentLink, setEnrichmentLink] = useState('');
  const [creating, setCreating] = useState(false);

  const [copySourceId, setCopySourceId] = useState('');
  const [copyName, setCopyName] = useState('');
  const [copyType, setCopyType] = useState('remediation');
  const [copying, setCopying] = useState(false);

  const [selectedWeekId, setSelectedWeekId] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [showClassReport, setShowClassReport] = useState(false);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const rows = await listWeeksForClass(schoolId, classId, teacherUid);
      setWeeks(rows);
    } catch (err) {
      setError(err.message || 'تعذّر تحميل الأسابيع الدراسية.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await createWeek(schoolId, { classId, teacherUid, name, type, enrichmentLink });
      setName('');
      setType('measurement');
      setEnrichmentLink('');
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر إنشاء الأسبوع الدراسي.');
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy(e) {
    e.preventDefault();
    setError('');
    if (!copySourceId || !copyName.trim() || copying) return;
    setCopying(true);
    try {
      await copyWeek(schoolId, copySourceId, { classId, teacherUid, name: copyName, type: copyType });
      setCopySourceId('');
      setCopyName('');
      setCopyType('remediation');
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر نسخ الأسبوع الدراسي.');
    } finally {
      setCopying(false);
    }
  }

  if (showReport) {
    return (
      <StudentReport
        schoolId={schoolId}
        classId={classId}
        teacherUid={teacherUid}
        className={className}
        subject={subject}
        teacherName={teacherName}
        onBack={() => setShowReport(false)}
      />
    );
  }

  if (showClassReport) {
    return (
      <ClassReport
        schoolId={schoolId}
        classId={classId}
        teacherUid={teacherUid}
        className={className}
        subject={subject}
        teacherName={teacherName}
        onBack={() => setShowClassReport(false)}
      />
    );
  }

  if (selectedWeekId) {
    const week = weeks.find((w) => w.id === selectedWeekId);
    return (
      <WeekDetail
        schoolId={schoolId}
        classId={classId}
        teacherUid={teacherUid}
        week={week}
        onBack={() => { setSelectedWeekId(null); refresh(); }}
      />
    );
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  return (
    <div style={{ maxWidth: 600, margin: '20px auto', padding: 16 }} dir="rtl">
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#0b7a4b', marginBottom: 10 }}>
        ← العودة إلى الفصول الدراسية
      </button>
      <h1>{className} — الأسابيع الدراسية</h1>
      <button onClick={() => setShowReport(true)} style={{ padding: '8px 14px', background: '#f2f2f2', border: 'none', borderRadius: 8, fontSize: 13, marginBottom: 8, marginLeft: 8 }}>
        تقرير طالبة
      </button>
      <button onClick={() => setShowClassReport(true)} style={{ padding: '8px 14px', background: '#f2f2f2', border: 'none', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
        تقرير الفصل
      </button>

      {error && <div style={{ background: '#fdecea', color: '#a10000', padding: 10, borderRadius: 8, marginBottom: 12 }}>{error}</div>}

      <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>إضافة أسبوع دراسي جديد</h3>
        <form onSubmit={handleCreate}>
          <label>اسم الأسبوع</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required />
          <label>النوع</label>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }}>
            <option value="measurement">قياس</option>
            <option value="remediation">معالجة</option>
          </select>
          <label>الرابط الإثرائي (اختياري)</label>
          <input type="text" value={enrichmentLink} onChange={(e) => setEnrichmentLink(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} />
          <button type="submit" disabled={creating} style={{ padding: '10px 16px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
            {creating ? '...' : 'إضافة'}
          </button>
        </form>
      </div>

      {weeks.length > 0 && (
        <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>نسخ من أسبوع سابق</h3>
          <form onSubmit={handleCopy}>
            <label>الأسبوع المصدر</label>
            <select value={copySourceId} onChange={(e) => setCopySourceId(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required>
              <option value="">اختيار أسبوع</option>
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({TYPE_LABELS[w.type]})</option>
              ))}
            </select>
            <label>اسم الأسبوع الجديد</label>
            <input type="text" value={copyName} onChange={(e) => setCopyName(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required />
            <label>النوع</label>
            <select value={copyType} onChange={(e) => setCopyType(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }}>
              <option value="measurement">قياس</option>
              <option value="remediation">معالجة</option>
            </select>
            <button type="submit" disabled={copying} style={{ padding: '10px 16px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
              {copying ? '...' : 'نسخ'}
            </button>
          </form>
        </div>
      )}

      <h3>الأسابيع الدراسية ({weeks.length})</h3>
      {weeks.length === 0 ? (
        <p style={{ color: '#666' }}>لا توجد أسابيع دراسية بعد.</p>
      ) : (
        weeks.map((w) => (
          <div key={w.id} style={{ border: '1px solid #eee', borderRadius: 8, marginBottom: 8, padding: 12 }}>
            <button onClick={() => setSelectedWeekId(w.id)} style={{ background: 'none', border: 'none', color: '#0b3d2e', fontWeight: 'bold', fontSize: 16, textAlign: 'right', cursor: 'pointer' }}>
              {w.name} — {TYPE_LABELS[w.type]}
            </button>
            {w.enrichmentLink && (
              <div style={{ fontSize: 13, marginTop: 4 }}>
                <a href={w.enrichmentLink} target="_blank" rel="noreferrer">الرابط الإثرائي</a>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
