import { useEffect, useState } from 'react';
import { listSchools, createSchool, setSchoolActive } from '../lib/schoolsApi';

export default function OwnerDashboard() {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [principalName, setPrincipalName] = useState('');
  const [creating, setCreating] = useState(false);
  const [lastCreatedCode, setLastCreatedCode] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const rows = await listSchools();
      setSchools(rows);
    } catch (err) {
      setError(err.message || 'تعذّر تحميل قائمة المدارس.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setLastCreatedCode('');
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const { schoolCode } = await createSchool({ name, principalName });
      setLastCreatedCode(schoolCode);
      setName('');
      setPrincipalName('');
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر إنشاء المدرسة.');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(school) {
    setError('');
    try {
      await setSchoolActive(school.id, !school.active);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر تحديث حالة المدرسة.');
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 16 }} dir="rtl">
      <h1>لوحة إدارة المدارس</h1>

      {error && (
        <div style={{ background: '#fdecea', color: '#a10000', padding: 10, borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>إضافة مدرسة جديدة</h3>
        <label>اسم المدرسة</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 10 }}
          required
        />
        <label>اسم المديرة (اختياري)</label>
        <input
          type="text"
          value={principalName}
          onChange={(e) => setPrincipalName(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 10 }}
        />
        <button
          type="submit"
          disabled={creating}
          style={{ padding: '10px 20px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}
        >
          {creating ? '...' : 'إنشاء المدرسة'}
        </button>

        {lastCreatedCode && (
          <div style={{ marginTop: 12, background: '#eaf6ee', padding: 10, borderRadius: 8 }}>
            تم الإنشاء ✅ — رمز المدرسة: <strong style={{ fontSize: 18 }}>{lastCreatedCode}</strong>
            <br />
            <small>سلّمي هذا الرمز لإدارة المدرسة عشان تنشئ حسابها.</small>
          </div>
        )}
      </form>

      <h3>المدارس ({schools.length})</h3>
      {loading ? (
        <p>...جاري التحميل</p>
      ) : schools.length === 0 ? (
        <p>ما فيه مدارس بعد.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'right' }}>
              <th style={{ padding: 8 }}>الاسم</th>
              <th style={{ padding: 8 }}>الرمز</th>
              <th style={{ padding: 8 }}>الحالة</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {schools.map((s) => (
              <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{s.name}</td>
                <td style={{ padding: 8, fontFamily: 'monospace' }}>{s.schoolCode}</td>
                <td style={{ padding: 8 }}>{s.active ? 'نشطة' : 'معطّلة'}</td>
                <td style={{ padding: 8 }}>
                  <button
                    onClick={() => handleToggle(s)}
                    style={{
                      padding: '6px 12px',
                      background: s.active ? '#a10000' : '#0b7a4b',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                    }}
                  >
                    {s.active ? 'تعطيل' : 'تفعيل'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
