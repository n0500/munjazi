import { useState } from 'react';
import { loginOwner, loginAdmin, loginTeacher, loginParent } from '../lib/auth';
import { registerSchoolAdmin } from '../lib/schoolAdminApi';
import { registerTeacher } from '../lib/teachersApi';
import Logo from '../components/Logo';
import Footer from '../components/Footer';
import { colors, font, radius, spacing } from '../lib/theme';

const TABS = [
  { key: 'admin', label: 'الإدارة' },
  { key: 'teacher', label: 'المعلّمة' },
  { key: 'parent', label: 'ولي الأمر' },
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

  const inputStyle = { width: '100%', padding: 10, marginBottom: 10, borderRadius: radius.button, border: `1px solid ${colors.border}`, boxSizing: 'border-box' };
  const submitStyle = { width: '100%', padding: 12, background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button };
  const linkStyle = { background: 'none', border: 'none', color: colors.primary, textDecoration: 'underline' };
  const linkStyleMuted = { background: 'none', border: 'none', color: colors.textMuted, textDecoration: 'underline' };

  return (
    <div>
      <div style={{ maxWidth: 420, margin: '40px auto 0', padding: spacing.lg }} dir="rtl">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: spacing.xl }}>
          <Logo size="lg" />
          <p style={{ fontFamily: font.family, fontSize: 13, color: colors.textMuted, marginTop: spacing.sm, marginBottom: 0 }}>
            نظام متابعة الأداء الدراسي
          </p>
        </div>

        {!ownerMode && !directParentLink && (
          <div style={{ display: 'flex', gap: 8, marginBottom: spacing.lg }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => { setTab(t.key); resetMsgs(); setRegisterMode(false); }}
                style={{
                  flex: 1, padding: 10, fontWeight: tab === t.key ? 'bold' : 'normal',
                  background: tab === t.key ? colors.ink : '#f2f2f2', color: tab === t.key ? '#fff' : '#000',
                  border: 'none', borderRadius: radius.button, fontFamily: font.family,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {error && <div style={{ background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.md }}>{error}</div>}
        {successMsg && <div style={{ background: colors.primaryTint, color: '#0b5c33', padding: 10, borderRadius: radius.button, marginBottom: spacing.md }}>{successMsg}</div>}

        {!ownerMode && (tab === 'admin' || tab === 'teacher') && !registerMode && (
          <form onSubmit={handleStaffSubmit}>
            <label>البريد الإلكتروني</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />
            <label>كلمة المرور</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} required />
            <button type="submit" disabled={busy} style={submitStyle}>{busy ? '...' : 'تسجيل الدخول'}</button>
            <p style={{ textAlign: 'center', marginTop: spacing.md }}>
              <button type="button" onClick={() => { setRegisterMode(true); resetMsgs(); }} style={linkStyle}>
                {tab === 'admin' ? 'إنشاء حساب إدارة جديد' : 'إنشاء حساب معلّمة جديدة'}
              </button>
            </p>
            {tab === 'admin' && (
              <p style={{ textAlign: 'center', marginTop: 4 }}>
                <button type="button" onClick={() => setOwnerMode(true)} style={linkStyleMuted}>دخول حساب المالك</button>
              </p>
            )}
          </form>
        )}

        {!ownerMode && (tab === 'admin' || tab === 'teacher') && registerMode && (
          <form onSubmit={handleRegister}>
            <label>رمز المدرسة</label>
            <input type="text" value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)} style={inputStyle} required />
            <label>الاسم</label>
            <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} style={inputStyle} />
            <label>البريد الإلكتروني</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />
            <label>كلمة المرور</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} required minLength={6} />
            <button type="submit" disabled={busy} style={submitStyle}>{busy ? '...' : 'إنشاء الحساب'}</button>
            <p style={{ textAlign: 'center', marginTop: spacing.md }}>
              <button type="button" onClick={() => { setRegisterMode(false); resetMsgs(); }} style={linkStyleMuted}>العودة إلى تسجيل الدخول</button>
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
            <p style={{ textAlign: 'center', marginTop: spacing.md }}>
              <button type="button" onClick={() => setOwnerMode(false)} style={linkStyleMuted}>عودة</button>
            </p>
          </form>
        )}

        {!ownerMode && tab === 'parent' && (
          <form onSubmit={handleParentSubmit}>
            <label>رقم السجل المدني (عشرة أرقام)</label>
            <input type="text" inputMode="numeric" value={nationalId} onChange={(e) => setNationalId(e.target.value)} style={inputStyle} required autoFocus />
            <button type="submit" disabled={busy} style={submitStyle}>{busy ? '...' : 'تسجيل الدخول'}</button>
          </form>
        )}
      </div>

      <Footer />
    </div>
  );
}
