import { useEffect, useState } from 'react';
import { listSchools, createSchool, setSchoolActive } from '../lib/schoolsApi';
import { colors, font, radius, spacing } from '../lib/theme';

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
    <div style={{ maxWidth: 600, margin: '40px auto', padding: spacing.lg }} dir="rtl">
      <h1 style={{ fontFamily: font.family, color: colors.ink }}>لوحة إدارة المدارس</h1>

      {error && (
        <div style={{ background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.lg }}>
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.xl }}>
        <h3 style={{ marginTop: 0, fontFamily: font.family }}>إضافة مدرسة جديدة</h3>
        <label>اسم المدرسة</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: spacing.sm, marginBottom: spacing.sm, boxSizing: 'border-box' }}
          required
        />
        <label>اسم المديرة (اختياري)</label>
        <input
          type="text"
          value={principalName}
          onChange={(e) => setPrincipalName(e.target.value)}
          style={{ width: '100%', padding: spacing.sm, marginBottom: spacing.sm, boxSizing: 'border-box' }}
        />
        <button
          type="submit"
          disabled={creating}
          style={{ padding: '10px 20px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }}
        >
          {creating ? '...' : 'إنشاء المدرسة'}
        </button>

        {lastCreatedCode && (
          <div style={{ marginTop: spacing.md, background: colors.primaryTint, padding: spacing.sm, borderRadius: radius.button }}>
            تم الإنشاء ✅ — رمز المدرسة: <strong style={{ fontSize: 18 }}>{lastCreatedCode}</strong>
            <br />
            <small>سلّمي هذا الرمز لإدارة المدرسة عشان تنشئ حسابها.</small>
          </div>
        )}
      </form>

      <h3 style={{ fontFamily: font.family }}>المدارس ({schools.length})</h3>
      {loading ? (
        <p>...جاري التحميل</p>
      ) : schools.length === 0 ? (
        <p>ما فيه مدارس بعد.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${colors.border}`, textAlign: 'right' }}>
              <th style={{ padding: spacing.sm }}>الاسم</th>
              <th style={{ padding: spacing.sm }}>الرمز</th>
              <th style={{ padding: spacing.sm }}>الحالة</th>
              <th style={{ padding: spacing.sm }}></th>
            </tr>
          </thead>
          <tbody>
            {schools.map((s) => (
              <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: spacing.sm }}>{s.name}</td>
                <td style={{ padding: spacing.sm, fontFamily: 'monospace' }}>{s.schoolCode}</td>
                <td style={{ padding: spacing.sm }}>{s.active ? 'نشطة' : 'معطّلة'}</td>
                <td style={{ padding: spacing.sm }}>
                  <button
                    onClick={() => handleToggle(s)}
                    style={{
                      padding: '6px 12px',
                      background: s.active ? colors.red : colors.primary,
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
