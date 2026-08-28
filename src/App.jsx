import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import OwnerDashboard from './pages/OwnerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import TeacherDashboard from './pages/TeacherDashboard';

function LogoutBar({ logout }) {
  return (
    <div style={{ textAlign: 'left', padding: 12 }} dir="rtl">
      <button
        onClick={logout}
        style={{ padding: '8px 16px', background: '#a10000', color: '#fff', border: 'none', borderRadius: 8 }}
      >
        تسجيل خروج
      </button>
    </div>
  );
}

function AppInner() {
  const { firebaseUser, profile, loading, logout } = useAuth();

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جاري التحميل</p>;

  if (!firebaseUser || !profile) {
    return <Login />;
  }

  if (profile.role === 'owner') {
    return (
      <div>
        <LogoutBar logout={logout} />
        <OwnerDashboard />
      </div>
    );
  }

  if (profile.role === 'admin') {
    return (
      <div>
        <LogoutBar logout={logout} />
        <AdminDashboard schoolId={profile.schoolId} />
      </div>
    );
  }

  if (profile.role === 'teacher') {
    return (
      <div>
        <LogoutBar logout={logout} />
        <TeacherDashboard schoolId={profile.schoolId} teacherUid={firebaseUser.uid} teacherName={profile.displayName} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: '60px auto', padding: 16, textAlign: 'center' }} dir="rtl">
      <h1>منجزي ✅</h1>
      <p>سجّلتِ الدخول بنجاح.</p>
      <p><strong>نوع الحساب:</strong> ولي أمر</p>
      <p><strong>الاسم:</strong> {profile.displayName}</p>
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
