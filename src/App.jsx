import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Logo from './components/Logo';
import PdfTestPage from './pages/PdfTestPage';
import { colors } from './lib/theme';

// تحميل تدريجي (Lazy Loading) لكل لوحة — يتحمّل كودها فقط وقت الحاجة الفعلية لها،
// بدل تحميل كل اللوحات دفعة واحدة عند أول فتح للموقع لأي مستخدم
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const TeacherDashboard = lazy(() => import('./pages/TeacherDashboard'));
const ParentDashboard = lazy(() => import('./pages/ParentDashboard'));

function LoadingFallback() {
  return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;
}

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
      <Logo size="sm" />
      <button
        onClick={logout}
        style={{ padding: '8px 16px', background: colors.red, color: '#fff', border: 'none', borderRadius: 8 }}
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
        <TopBar logout={logout} />
        <Suspense fallback={<LoadingFallback />}>
          <OwnerDashboard />
        </Suspense>
      </div>
    );
  }

  if (profile.role === 'admin') {
    return (
      <div>
        <TopBar logout={logout} />
        <Suspense fallback={<LoadingFallback />}>
          <AdminDashboard schoolId={profile.schoolId} />
        </Suspense>
      </div>
    );
  }

  if (profile.role === 'teacher') {
    return (
      <div>
        <TopBar logout={logout} />
        <Suspense fallback={<LoadingFallback />}>
          <TeacherDashboard schoolId={profile.schoolId} teacherUid={firebaseUser.uid} teacherName={profile.displayName} />
        </Suspense>
      </div>
    );
  }

  return (
    <div>
      <Suspense fallback={<LoadingFallback />}>
        <ParentDashboard schoolId={profile.schoolId} profile={profile} logout={logout} />
      </Suspense>
    </div>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  // مسار اختبار معزول تمامًا لتجربة PDF بالعربي — يُزال بعد انتهاء الاختبار
  if (params.get('pdftest') === '1') {
    return <PdfTestPage />;
  }

  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
