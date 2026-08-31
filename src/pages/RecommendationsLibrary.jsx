import { useEffect, useState } from 'react';
import {
  STATUS_LABELS,
  DEFAULT_RECOMMENDATIONS,
  listCustomRecommendations,
  addCustomRecommendation,
  deleteCustomRecommendation,
} from '../lib/recommendationsApi';
import { colors, font, radius, spacing } from '../lib/theme';

const EDITABLE_STATUSES = ['needsSupport', 'notMastered', 'absent'];

export default function RecommendationsLibrary({ schoolId, teacherUid, onBack }) {
  const [customByStatus, setCustomByStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newText, setNewText] = useState({});
  const [adding, setAdding] = useState({});

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const map = {};
      await Promise.all(
        EDITABLE_STATUSES.map(async (status) => {
          map[status] = await listCustomRecommendations(schoolId, teacherUid, status);
        }),
      );
      setCustomByStatus(map);
    } catch (err) {
      setError(err.message || 'تعذّر تحميل مكتبة التوصيات.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd(status) {
    setError('');
    const text = (newText[status] || '').trim();
    if (!text || adding[status]) return;
    setAdding((prev) => ({ ...prev, [status]: true }));
    try {
      await addCustomRecommendation(schoolId, teacherUid, status, text);
      setNewText((prev) => ({ ...prev, [status]: '' }));
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر إضافة التوصية.');
    } finally {
      setAdding((prev) => ({ ...prev, [status]: false }));
    }
  }

  async function handleDelete(id) {
    setError('');
    try {
      await deleteCustomRecommendation(schoolId, id);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر حذف التوصية.');
    }
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  return (
    <div style={{ maxWidth: 600, margin: '20px auto', padding: spacing.lg }} dir="rtl">
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.primary, marginBottom: spacing.sm }}>
        ← العودة إلى لوحة المعلّمة
      </button>
      <h1 style={{ fontFamily: font.family, color: colors.ink }}>مكتبة التوصيات</h1>

      {error && <div style={{ background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.md }}>{error}</div>}

      {EDITABLE_STATUSES.map((status) => (
        <div key={status} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.lg }}>
          <h3 style={{ marginTop: 0, fontFamily: font.family }}>{STATUS_LABELS[status]}</h3>

          <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 6 }}>التوصيات الافتراضية:</p>
          {(DEFAULT_RECOMMENDATIONS[status] || []).map((text, i) => (
            <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #f2f2f2', fontSize: 14, color: colors.text }}>{text}</div>
          ))}

          <p style={{ fontSize: 13, color: colors.textMuted, marginTop: 12, marginBottom: 6 }}>توصياتي الخاصة:</p>
          {(customByStatus[status] || []).length === 0 ? (
            <p style={{ fontSize: 13, color: colors.textMuted }}>لا توجد توصيات مضافة بعد.</p>
          ) : (
            customByStatus[status].map((rec) => (
              <div key={rec.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f2f2f2' }}>
                <span style={{ fontSize: 14 }}>{rec.text}</span>
                <button onClick={() => handleDelete(rec.id)} style={{ padding: '2px 8px', background: colors.red, color: '#fff', border: 'none', borderRadius: 6, fontSize: 12 }}>
                  حذف
                </button>
              </div>
            ))
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: spacing.sm }}>
            <input
              type="text"
              placeholder="إضافة توصية جديدة"
              value={newText[status] || ''}
              onChange={(e) => setNewText((prev) => ({ ...prev, [status]: e.target.value }))}
              style={{ flex: 1, padding: 8 }}
            />
            <button onClick={() => handleAdd(status)} disabled={adding[status]} style={{ padding: '8px 14px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }}>
              {adding[status] ? '...' : 'إضافة'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
