import { useEffect, useState } from 'react';
import {
  STATUS_LABELS,
  DEFAULT_RECOMMENDATIONS,
  listCustomRecommendations,
  addCustomRecommendation,
  deleteCustomRecommendation,
} from '../lib/recommendationsApi';

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
    <div style={{ maxWidth: 600, margin: '20px auto', padding: 16 }} dir="rtl">
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#0b7a4b', marginBottom: 10 }}>
        ← العودة إلى لوحة المعلّمة
      </button>
      <h1>مكتبة التوصيات</h1>

      {error && <div style={{ background: '#fdecea', color: '#a10000', padding: 10, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {EDITABLE_STATUSES.map((status) => (
        <div key={status} style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>{STATUS_LABELS[status]}</h3>

          <p style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>التوصيات الافتراضية:</p>
          {(DEFAULT_RECOMMENDATIONS[status] || []).map((text, i) => (
            <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #f2f2f2', fontSize: 14, color: '#444' }}>{text}</div>
          ))}

          <p style={{ fontSize: 13, color: '#666', marginTop: 12, marginBottom: 6 }}>توصياتي الخاصة:</p>
          {(customByStatus[status] || []).length === 0 ? (
            <p style={{ fontSize: 13, color: '#999' }}>لا توجد توصيات مضافة بعد.</p>
          ) : (
            customByStatus[status].map((rec) => (
              <div key={rec.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f2f2f2' }}>
                <span style={{ fontSize: 14 }}>{rec.text}</span>
                <button onClick={() => handleDelete(rec.id)} style={{ padding: '2px 8px', background: '#a10000', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12 }}>
                  حذف
                </button>
              </div>
            ))
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              type="text"
              placeholder="إضافة توصية جديدة"
              value={newText[status] || ''}
              onChange={(e) => setNewText((prev) => ({ ...prev, [status]: e.target.value }))}
              style={{ flex: 1, padding: 8 }}
            />
            <button onClick={() => handleAdd(status)} disabled={adding[status]} style={{ padding: '8px 14px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
              {adding[status] ? '...' : 'إضافة'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
