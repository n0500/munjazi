import { useState } from 'react';
import { loginOwner, loginAdmin, loginTeacher, loginParent } from '../lib/auth';
import { registerSchoolAdmin } from '../lib/schoolAdminApi';
import { registerTeacher } from '../lib/teachersApi';

const TABS = [
  { key: 'admin', label: 'إدارة' },
  { key: 'teacher', label: 'معلمة' },
  { key: 'parent', label: 'ولي أمر' },
];

export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const directParentLink = params.get('role') === 'parent';

  const [tab, setTab] = useState(directParentLink ? 'parent' : 'admin');
  const [ownerMode, setOwnerMode] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [regName, setRegName] = useState('');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [busy, setBusy] = useState(false);

  function resetMsgs() {
    setError('');
    setSuccessMsg('');
  }

  async function handleStaffSubmit(e) {
    e.preventDefault();
    resetMsgs();
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

  async function handleRegister(e) {
    e.preventDefault();
    resetMsgs();
    if (!schoolCode.trim() || !email.trim() || !password || busy) return;
    setBusy(true);
    try {
      const registerFn = tab === 'admin' ? registerSchoolAdmin : registerTeacher;
      const label = tab === 'admin' ? 'إدارة' : 'معلّمة';
      const { schoolName } = await registerFn({ schoolCode, displayName: regName, email, password });
      setSuccessMsg(`تم إنشاء حساب ${label} "${schoolName}" وتسجيل الدخول بنجاح.`);
    } catch (err) {
      setError(err.message || 'تعذّر إنشاء الحساب.');
    } finally {
      setBusy(false);
    }
  }

  async function handleParentSubmit(e) {
    e.preventDefault();
    resetMsgs();
    if (!nationalId.trim() || busy) return;
    setBusy(true);
    try {
      await loginParent(nationalId);
    } catch (err) {
      setError(err.message || 'تعذّر تسجيل الدخول.');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = { width: '100%', padding: 10, marginBottom: 10 };
  const submitStyle = { width: '100%', padding: 12, background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8 };
  const linkStyle = { background: 'none', border: 'none', color: '#0b7a4b', textDecoration: 'underline' };
  const linkStyleMuted = { background: 'none', border: 'none', color: '#666', textDecoration: 'underline' };

  return (
    <div style={{ maxWidth: 420, margin: '40px auto', padding: 16 }} dir="rtl">
      <h1 style={{ textAlign: 'center' }}>منجزي</h1>

      {!ownerMode && !directParentLink && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTab(t.key); resetMsgs(); setRegisterMode(false); }}
              style={{
                flex: 1, padding: 10, fontWeight: tab === t.key ? 'bold' : 'normal',
                background: tab === t.key ? '#0b3d2e' : '#f2f2f2', color: tab === t.key ? '#fff' : '#000',
                border: 'none', borderRadius: 8,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {error && <div style={{ background: '#fdecea', color: '#a10000', padding: 10, borderRadius: 8, marginBottom: 12 }}>{error}</div>}
      {successMsg && <div style={{ background: '#eaf6ee', color: '#0b5c33', padding: 10, borderRadius: 8, marginBottom: 12 }}>{successMsg}</div>}

      {!ownerMode && (tab === 'admin' || tab === 'teacher') && !registerMode && (
        <form onSubmit={handleStaffSubmit}>
          <label>البريد الإلكتروني</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />
          <label>كلمة المرور</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} required />
          <button type="submit" disabled={busy} style={submitStyle}>{busy ? '...' : 'تسجيل الدخول'}</button>
          <p style={{ textAlign: 'center', marginTop: 12 }}>
            <button type="button" onClick={() => { setRegisterMode(true); resetMsgs(); }} style={linkStyle}>
              {tab === 'admin' ? 'إنشاء حساب إدارة جديد' : 'إنشاء حساب معلّمة جديد'}
            </button>
          </p>
          {tab === 'admin' && (
            <p style={{ textAlign: 'center', marginTop: 4 }}>
              <button type="button" onClick={() => setOwnerMode(true)} style={linkStyleMuted}>Admin يدخل من هنا أيضًا</button>
            </p>
          )}
        </form>
      )}

      {!ownerMode && (tab === 'admin' || tab === 'teacher') && registerMode && (
        <form onSubmit={handleRegister}>
          <label>رمز المدرسة</label>
          <input type="text" value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)} style={inputStyle} required />
          <label>اسمك</label>
          <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} style={inputStyle} />
          <label>البريد الإلكتروني</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />
          <label>كلمة المرور</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} required minLength={6} />
          <button type="submit" disabled={busy} style={submitStyle}>{busy ? '...' : 'إنشاء الحساب'}</button>
          <p style={{ textAlign: 'center', marginTop: 12 }}>
            <button type="button" onClick={() => { setRegisterMode(false); resetMsgs(); }} style={linkStyleMuted}>رجوع لتسجيل الدخول</button>
          </p>
        </form>
      )}

      {ownerMode && (
        <form onSubmit={handleStaffSubmit}>
          <label>البريد الإلكتروني</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />
          <label>كلمة المرور</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} required />
          <button type="submit" disabled={busy} style={submitStyle}>{busy ? '...' : 'تسجيل الدخول'}</button>
          <p style={{ textAlign: 'center', marginTop: 12 }}>
            <button type="button" onClick={() => setOwnerMode(false)} style={linkStyleMuted}>رجوع</button>
          </p>
        </form>
      )}

      {!ownerMode && tab === 'parent' && (
        <form onSubmit={handleParentSubmit}>
          <label>السجل المدني (10 أرقام)</label>
          <input type="text" inputMode="numeric" value={nationalId} onChange={(e) => setNationalId(e.target.value)} style={inputStyle} required autoFocus />
          <button type="submit" disabled={busy} style={submitStyle}>{busy ? '...' : 'تسجيل الدخول'}</button>
        </form>
      )}
    </div>
  );
}
