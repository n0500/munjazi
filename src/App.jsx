import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import OwnerDashboard from './pages/OwnerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import ParentDashboard from './pages/ParentDashboard';
import Footer from './components/Footer';
import Logo from './components/Logo';
import { colors } from './lib/theme';

function TopBar({ logout }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: `1px solid ${colors.border}`,
      }}
      dir="rtl"
    >
      <button
        onClick={logout}
        style={{ padding: '8px 16px', background: colors.red, color: '#fff', border: 'none', borderRadius: 8 }}
      >
        تسجيل الخروج
      </button>
      <Logo size="sm" />
    </div>
  );
}

function AppInner() {
  const { firebaseUser, profile, loading, logout } = useAuth();

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  if (!firebaseUser || !profile) {
    return <Login />;
  }

  if (profile.role === 'owner') {
    return (
      <div>
        <TopBar logout={logout} />
        <OwnerDashboard />
        <Footer />
      </div>
    );
  }

  if (profile.role === 'admin') {
    return (
      <div>
        <TopBar logout={logout} />
        <AdminDashboard schoolId={profile.schoolId} />
        <Footer />
      </div>
    );
  }

  if (profile.role === 'teacher') {
    return (
      <div>
        <TopBar logout={logout} />
        <TeacherDashboard schoolId={profile.schoolId} teacherUid={firebaseUser.uid} teacherName={profile.displayName} />
        <Footer />
      </div>
    );
  }

  return (
    <div>
      <ParentDashboard schoolId={profile.schoolId} profile={profile} logout={logout} />
      <Footer />
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
