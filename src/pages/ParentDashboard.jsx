import { useEffect, useState } from 'react';
import { listPlansForStudent } from '../lib/remediationApi';

export default function ParentDashboard({ schoolId, profile, logout }) {
  const [activePlans, setActivePlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const plans = await listPlansForStudent(schoolId, profile.studentId);
        setActivePlans(plans.filter((p) => p.status === 'active'));
      } finally {
        setLoading(false);
      }
    })();
  }, [schoolId, profile.studentId]);

  return (
    <div style={{ maxWidth: 420, margin: '60px auto', padding: 16, textAlign: 'center' }} dir="rtl">
      <h1>منجزي ✅</h1>
      <p>تم تسجيل الدخول بنجاح.</p>
      <p><strong>نوع الحساب:</strong> ولي الأمر</p>
      <p><strong>الاسم:</strong> {profile.displayName}</p>

      {!loading && activePlans.length > 0 && (
        <div style={{ background: '#fff9ec', border: '1px solid #d99a00', borderRadius: 10, padding: 14, marginTop: 20, textAlign: 'right' }}>
          <strong style={{ color: '#8a5a00' }}>يوجد خطة علاجية نشطة لابنتك</strong>
          {activePlans.map((p) => (
            <p key={p.id} style={{ fontSize: 13, marginTop: 6 }}>
              المهارة المستهدفة: {p.skillTitle}
              {p.enrichmentLink && (
                <>
                  {' — '}
                  <a href={p.enrichmentLink} target="_blank" rel="noreferrer">الرابط الإثرائي</a>
                </>
              )}
            </p>
          ))}
        </div>
      )}

      <button
        onClick={logout}
        style={{ marginTop: 20, padding: '10px 20px', background: '#a10000', color: '#fff', border: 'none', borderRadius: 8 }}
      >
        تسجيل الخروج
      </button>
    </div>
  );
}
