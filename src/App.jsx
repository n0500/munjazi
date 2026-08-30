import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import OwnerDashboard from './pages/OwnerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import ParentDashboard from './pages/ParentDashboard';
import Footer from './components/Footer';

function LogoutBar({ logout }) {
  return (
    <div style={{ textAlign: 'left', padding: 12 }} dir="rtl">
      <button
        onClick={logout}
        style={{ padding: '8px 16px', background: '#a10000', color: '#fff', border: 'none', borderRadius: 8 }}
      >
        تسجيل الخروج
      </button>
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
        <LogoutBar logout={logout} />
        <OwnerDashboard />
        <Footer />
      </div>
    );
  }

  if (profile.role === 'admin') {
    return (
      <div>
        <LogoutBar logout={logout} />
        <AdminDashboard schoolId={profile.schoolId} />
        <Footer />
      </div>
    );
  }

  if (profile.role === 'teacher') {
    return (
      <div>
        <LogoutBar logout={logout} />
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
