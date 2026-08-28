import { useEffect, useState } from 'react';
import { getClass } from '../lib/classesApi';
import {
  listClassStudents,
  bulkImportStudents,
  addSingleStudent,
  updateStudent,
  deleteStudent,
  moveStudent,
} from '../lib/studentsApi';

export default function ClassDetail({ schoolId, classId, allClasses, onBack }) {
  const [cls, setCls] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportMsg, setReportMsg] = useState('');

  const [pasteText, setPasteText] = useState('');
  const [importing, setImporting] = useState(false);

  const [singleName, setSingleName] = useState('');
  const [singleId, setSingleId] = useState('');
  const [addingSingle, setAddingSingle] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editId, setEditId] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [clsRow, studentRows] = await Promise.all([
        getClass(schoolId, classId),
        listClassStudents(schoolId, classId),
      ]);
      setCls(clsRow);
      setStudents(studentRows);
    } catch (err) {
      setError(err.message || 'تعذّر تحميل بيانات الفصل.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  async function handleImport() {
    setError('');
    setReportMsg('');
    if (!pasteText.trim() || importing) return;
    setImporting(true);
    try {
      const { success, failed, total } = await bulkImportStudents(schoolId, classId, pasteText);
      setReportMsg(
        `تمت إضافة ${success} من ${total}.` +
          (failed.length ? ` تعذّر إضافة ${failed.length}: ${failed.map((f) => f.name || '؟').join('، ')}` : ''),
      );
      setPasteText('');
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر استيراد القائمة.');
    } finally {
      setImporting(false);
    }
  }

  async function handleAddSingle(e) {
    e.preventDefault();
    setError('');
    if (!singleName.trim() || !singleId.trim() || addingSingle) return;
    setAddingSingle(true);
    try {
      await addSingleStudent(schoolId, classId, singleName, singleId);
      setSingleName('');
      setSingleId('');
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر إضافة الطالبة.');
    } finally {
      setAddingSingle(false);
    }
  }

  function startEdit(s) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditId('');
  }

  async function handleSaveEdit(studentId) {
    setError('');
    try {
      await updateStudent(schoolId, studentId, { name: editName, nationalId: editId });
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر حفظ التعديل.');
    }
  }

  async function handleDelete(studentId, name) {
    if (!window.confirm(`متأكدة تبين تحذفين "${name}"؟ هذا الإجراء لا يمكن التراجع عنه.`)) return;
    setError('');
    try {
      await deleteStudent(schoolId, studentId);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر الحذف.');
    }
  }

  async function handleMove(studentId, newClassId) {
    setError('');
    try {
      await moveStudent(schoolId, studentId, newClassId);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر النقل.');
    }
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جاري التحميل</p>;

  return (
    <div style={{ maxWidth: 600, margin: '20px auto', padding: 16 }} dir="rtl">
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#0b7a4b', marginBottom: 10 }}>
        ← رجوع لقائمة الفصول
      </button>
      <h1>{cls?.name}</h1>

      {error && <div style={{ background: '#fdecea', color: '#a10000', padding: 10, borderRadius: 8, marginBottom: 12 }}>{error}</div>}
      {reportMsg && <div style={{ background: '#eaf6ee', color: '#0b5c33', padding: 10, borderRadius: 8, marginBottom: 12 }}>{reportMsg}</div>}

      <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>استيراد قائمة طالبات (لصق)</h3>
        <p style={{ fontSize: 13, color: '#666' }}>سطر لكل طالبة، بصيغة: الاسم, السجل المدني</p>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={6}
          placeholder={'سارة أحمد المطيري, 1234567890\nنورة سعد القحطاني, 1234567891'}
          style={{ width: '100%', padding: 10, marginBottom: 10, fontFamily: 'monospace' }}
        />
        <button onClick={handleImport} disabled={importing} style={{ padding: '10px 20px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
          {importing ? '...' : 'استيراد'}
        </button>
      </div>

      <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>إضافة طالبة واحدة</h3>
        <form onSubmit={handleAddSingle} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="text" placeholder="الاسم" value={singleName} onChange={(e) => setSingleName(e.target.value)} style={{ flex: 1, padding: 10, minWidth: 140 }} required />
          <input type="text" placeholder="السجل المدني" inputMode="numeric" value={singleId} onChange={(e) => setSingleId(e.target.value)} style={{ flex: 1, padding: 10, minWidth: 140 }} required />
          <button type="submit" disabled={addingSingle} style={{ padding: '10px 16px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
            {addingSingle ? '...' : 'إضافة'}
          </button>
        </form>
      </div>

      <h3>الطالبات ({students.length})</h3>
      {students.length === 0 ? (
        <p style={{ color: '#666' }}>ما فيه طالبات بهذا الفصل بعد.</p>
      ) : (
        students.map((s) => (
          <div key={s.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 10, marginBottom: 8 }}>
            {editingId === s.id ? (
              <div>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="الاسم" style={{ width: '100%', padding: 8, marginBottom: 6 }} />
                <input type="text" value={editId} onChange={(e) => setEditId(e.target.value)} placeholder="سجل مدني جديد (اتركيه فاضي لعدم التغيير)" style={{ width: '100%', padding: 8, marginBottom: 6 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handleSaveEdit(s.id)} style={{ padding: '6px 12px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 6 }}>حفظ</button>
                  <button onClick={() => setEditingId(null)} style={{ padding: '6px 12px', background: '#f2f2f2', border: 'none', borderRadius: 6 }}>إلغاء</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span>{s.name}</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select value={classId} onChange={(e) => handleMove(s.id, e.target.value)} style={{ padding: 4 }}>
                    {(allClasses || []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button onClick={() => startEdit(s)} style={{ padding: '4px 10px', background: '#f2f2f2', border: 'none', borderRadius: 6 }}>تعديل</button>
                  <button onClick={() => handleDelete(s.id, s.name)} style={{ padding: '4px 10px', background: '#a10000', color: '#fff', border: 'none', borderRadius: 6 }}>حذف</button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
