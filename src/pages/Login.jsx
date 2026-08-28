import { useState } from 'react';
import { loginOwner, loginAdmin, loginTeacher, loginParent } from '../lib/auth';
import { registerSchoolAdmin } from '../lib/schoolAdminApi';

const TABS = [
  { key: 'admin', label: 'إدارة' },
  { key: 'teacher', label: 'معلمة' },
  { key: 'parent', label: 'ولي أمر' },
];

export default function Login() {
  const [tab, setTab] = useState('admin');
  const [ownerMode, setOwnerMode] = useState(false);
  const [adminRegisterMode, setAdminRegisterMode] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [adminName, setAdminName] = useState('');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleStaffSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    try {
      if (ownerMode) {
        await loginOwner(email, password);
      } else if (tab === 'admin') {
        await loginAdmin(email, password);
      } else if (tab === 'teacher') {
        await loginTeacher(email, password);
      }
    } catch (err) {
      setError(err.message || 'تعذّر تسجيل الدخول.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAdminRegister(e) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!schoolCode.trim() || !email.trim() || !password || busy) return;
    setBusy(true);
    try {
      const { schoolName } = await registerSchoolAdmin({
        schoolCode,
        displayName: adminName,
        email,
        password,
      });
      setSuccessMsg(`تم إنشاء حساب إدارة "${schoolName}" وتسجيل الدخول بنجاح.`);
    } catch (err) {
      setError(err.message || 'تعذّر إنشاء حساب الإدارة.');
    } finally {
      setBusy(false);
    }
  }

  async function handleParentSubmit(e) {
    e.preventDefault();
    setError('');
    if (!schoolCode.trim() || !nationalId.trim() || busy) return;
    setBusy(true);
    try {
      await loginParent(schoolCode, nationalId);
    } catch (err) {
      setError(err.message || 'تعذّر تسجيل الدخول.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '40px auto', padding: 16 }} dir="rtl">
      <h1 style={{ textAlign: 'center' }}>منجزي</h1>

      {!ownerMode && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTab(t.key); setError(''); setSuccessMsg(''); setAdminRegisterMode(false); }}
              style={{
                flex: 1,
                padding: 10,
                fontWeight: tab === t.key ? 'bold' : 'normal',
                background: tab === t.key ? '#0b3d2e' : '#f2f2f2',
                color: tab === t.key ? '#fff' : '#000',
                border: 'none',
                borderRadius: 8,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ background: '#fdecea', color: '#a10000', padding: 10, borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {successMsg && (
        <div style={{ background: '#eaf6ee', color: '#0b5c33', padding: 10, borderRadius: 8, marginBottom: 12 }}>
          {successMsg}
        </div>
      )}

      {!ownerMode && tab === 'admin' && !adminRegisterMode && (
        <form onSubmit={handleStaffSubmit}>
          <label>البريد الإلكتروني</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required />
          <label>كلمة المرور</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required />
          <button type="submit" disabled={busy} style={{ width: '100%', padding: 12, background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
            {busy ? '...' : 'تسجيل الدخول'}
          </button>
          <p style={{ textAlign: 'center', marginTop: 12 }}>
            <button type="button" onClick={() => { setAdminRegisterMode(true); setError(''); setSuccessMsg(''); }} style={{ background: 'none', border: 'none', color: '#0b7a4b', textDecoration: 'underline' }}>
              إنشاء حساب إدارة جديد
            </button>
          </p>
          <p style={{ textAlign: 'center', marginTop: 4 }}>
            <button type="button" onClick={() => setOwnerMode(true)} style={{ background: 'none', border: 'none', color: '#666', textDecoration: 'underline' }}>
              Admin يدخل من هنا أيضًا
            </button>
          </p>
        </form>
      )}

      {!ownerMode && tab === 'admin' && adminRegisterMode && (
        <form onSubmit={handleAdminRegister}>
          <label>رمز المدرسة</label>
          <input type="text" value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required />
          <label>اسمك</label>
          <input type="text" value={adminName} onChange={(e) => setAdminName(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} />
          <label>البريد الإلكتروني</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required />
          <label>كلمة المرور</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required minLength={6} />
          <button type="submit" disabled={busy} style={{ width: '100%', padding: 12, background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
            {busy ? '...' : 'إنشاء الحساب'}
          </button>
          <p style={{ textAlign: 'center', marginTop: 12 }}>
            <button type="button" onClick={() => { setAdminRegisterMode(false); setError(''); setSuccessMsg(''); }} style={{ background: 'none', border: 'none', color: '#666', textDecoration: 'underline' }}>
              رجوع لتسجيل الدخول
            </button>
          </p>
        </form>
      )}

      {ownerMode && (
        <form onSubmit={handleStaffSubmit}>
          <label>البريد الإلكتروني</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required />
          <label>كلمة المرور</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required />
          <button type="submit" disabled={busy} style={{ width: '100%', padding: 12, background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
            {busy ? '...' : 'تسجيل الدخول'}
          </button>
          <p style={{ textAlign: 'center', marginTop: 12 }}>
            <button type="button" onClick={() => setOwnerMode(false)} style={{ background: 'none', border: 'none', color: '#666', textDecoration: 'underline' }}>
              رجوع
            </button>
          </p>
        </form>
      )}

      {!ownerMode && tab === 'teacher' && (
        <form onSubmit={handleStaffSubmit}>
          <label>البريد الإلكتروني</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required />
          <label>كلمة المرور</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required />
          <button type="submit" disabled={busy} style={{ width: '100%', padding: 12, background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
            {busy ? '...' : 'تسجيل الدخول'}
          </button>
        </form>
      )}

      {!ownerMode && tab === 'parent' && (
        <form onSubmit={handleParentSubmit}>
          <label>رمز المدرسة</label>
          <input type="text" value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required />
          <label>السجل المدني (10 أرقام)</label>
          <input type="text" inputMode="numeric" value={nationalId} onChange={(e) => setNationalId(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10 }} required />
          <button type="submit" disabled={busy} style={{ width: '100%', padding: 12, background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 }}>
            {busy ? '...' : 'تسجيل الدخول'}
          </button>
        </form>
      )}
    </div>
  );
}
