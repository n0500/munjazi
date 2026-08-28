import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';

function AppInner() {
  const { firebaseUser, profile, loading, logout } = useAuth();

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جاري التحميل</p>;

  if (!firebaseUser || !profile) {
    return <Login />;
  }

  // نجاح الدخول — عرض تأكيد مبدئي فقط (المرحلة 2 مقصورة على تسجيل الدخول)
  const roleLabels = { owner: 'مالكة المنصة', admin: 'إدارة المدرسة', teacher: 'معلّمة', parent: 'ولي أمر' };

  return (
    <div style={{ maxWidth: 420, margin: '60px auto', padding: 16, textAlign: 'center' }} dir="rtl">
      <h1>منجزي ✅</h1>
      <p>سجّلتِ الدخول بنجاح.</p>
      <p>
        <strong>نوع الحساب:</strong> {roleLabels[profile.role] || profile.role}
      </p>
      <p>
        <strong>الاسم:</strong> {profile.displayName}
      </p>
      <button
        onClick={logout}
        style={{ marginTop: 20, padding: '10px 20px', background: '#a10000', color: '#fff', border: 'none', borderRadius: 8 }}
      >
        تسجيل خروج
      </button>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
