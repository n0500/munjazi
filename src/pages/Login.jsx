import { useState } from 'react';
import { loginOwner, loginAdmin, loginTeacher, loginParent, requestPasswordReset } from '../lib/auth';
import { registerTeacher } from '../lib/teachersApi';
import Logo from '../components/Logo';
import Footer from '../components/Footer';
import { colors, font, radius, spacing } from '../lib/theme';

const TABS = [
  { key: 'admin', label: 'الإدارة' },
  { key: 'teacher', label: 'المعلّمة' },
  { key: 'parent', label: 'ولي الأمر' },
];

function getStaffLoginErrorMessage(err) {
  const code = err?.code || '';

  if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(code)) {
    return 'بيانات الدخول غير صحيحة. تأكدي من البريد الإلكتروني وكلمة المرور ثم حاولي مرة أخرى.';
  }
  if (code === 'auth/invalid-email') {
    return 'يرجى التأكد من صحة البريد الإلكتروني.';
  }
  if (code === 'auth/user-disabled') {
    return 'هذا الحساب معطّل حاليًا. تواصلي مع إدارة المدرسة.';
  }
  if (code === 'auth/too-many-requests') {
    return 'تمت عدة محاولات تسجيل دخول خلال وقت قصير. انتظري قليلًا ثم حاولي مرة أخرى.';
  }
  if (code === 'auth/network-request-failed') {
    return 'تعذّر الاتصال. تحققي من اتصال الإنترنت ثم حاولي مرة أخرى.';
  }

  // نعرض رسائل منجزي المخصصة، ولا نعرض رسائل Firebase التقنية للمستخدمة.
  const message = typeof err?.message === 'string' ? err.message.trim() : '';
  if (message && !message.startsWith('Firebase:') && !code.startsWith('auth/')) {
    return message;
  }

  return 'حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.';
}

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
  const [resetBusy, setResetBusy] = useState(false);

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
      setError(getStaffLoginErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    resetMsgs();
    if (resetBusy) return;
    if (!email.trim()) {
      setError('أدخلي البريد الإلكتروني أولًا، ثم اختاري «نسيت كلمة المرور؟».');
      return;
    }
    setResetBusy(true);
    try {
      await requestPasswordReset(email);
      setSuccessMsg('أرسلنا لك رسالة لاستعادة كلمة المرور. افتحي بريدك الإلكتروني، ثم افتحي رسالة استعادة كلمة المرور واضغطي رابط إعادة التعيين. إذا لم تجديها، تحققي من مجلد الرسائل غير المرغوب فيها.');
    } catch (err) {
      if (err?.code === 'auth/user-not-found') {
        setSuccessMsg('إذا كان هذا البريد مسجّلًا في منجزي، فستصل إليه رسالة لاستعادة كلمة المرور. افتحي الرسالة واضغطي رابط إعادة التعيين، وتحققي من مجلد الرسائل غير المرغوب فيها إذا لم تجديها.');
      } else if (err?.code === 'auth/invalid-email') {
        setError('البريد الإلكتروني غير صحيح.');
      } else if (err?.code === 'auth/too-many-requests') {
        setError('تم إرسال عدة طلبات خلال وقت قصير. يُرجى المحاولة لاحقًا.');
      } else {
        setError(err.message || 'تعذّر إرسال رابط إعادة تعيين كلمة المرور.');
      }
    } finally {
      setResetBusy(false);
    }
  }

  // تسجيل حساب جديد متاح للمعلّمات فقط. حسابات الإدارة تُنشأ حصرًا من لوحة المالكة،
  // وتُسلَّم بيانات الدخول للمديرة مباشرة — لا يوجد مسار تسجيل عام لحساب إدارة.
  async function handleRegister(e) {
    e.preventDefault();
    resetMsgs();
    if (!schoolCode.trim() || !email.trim() || !password || busy) return;
    setBusy(true);
    try {
      const { schoolName } = await registerTeacher({ schoolCode, displayName: regName, email, password });
      setSuccessMsg(`تم إنشاء حساب معلّمة "${schoolName}" وتسجيل الدخول بنجاح.`);
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

  const forgotPasswordButton = (
    <button
      type="button"
      onClick={handleForgotPassword}
      disabled={resetBusy}
      style={{ ...linkStyle, fontSize: 13, opacity: resetBusy ? 0.6 : 1 }}
    >
      {resetBusy ? '...جارٍ الإرسال' : 'نسيت كلمة المرور؟'}
    </button>
  );

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

        {!ownerMode && tab === 'admin' && (
          <form onSubmit={handleStaffSubmit}>
            <label>البريد الإلكتروني</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />
            <label>كلمة المرور</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} required />
            <button type="submit" disabled={busy} style={submitStyle}>{busy ? '...' : 'تسجيل الدخول'}</button>
            <p style={{ textAlign: 'center', marginTop: spacing.sm, marginBottom: 0 }}>{forgotPasswordButton}</p>
            <p style={{ textAlign: 'center', marginTop: 4 }}>
              <button type="button" onClick={() => setOwnerMode(true)} style={linkStyleMuted}>دخول حساب المالك</button>
            </p>
          </form>
        )}

        {!ownerMode && tab === 'teacher' && !registerMode && (
          <form onSubmit={handleStaffSubmit}>
            <label>البريد الإلكتروني</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />
            <label>كلمة المرور</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} required />
            <button type="submit" disabled={busy} style={submitStyle}>{busy ? '...' : 'تسجيل الدخول'}</button>
            <p style={{ textAlign: 'center', marginTop: spacing.sm, marginBottom: 0 }}>{forgotPasswordButton}</p>
            <p style={{ textAlign: 'center', marginTop: spacing.md }}>
              <button type="button" onClick={() => { setRegisterMode(true); resetMsgs(); }} style={linkStyle}>
                إنشاء حساب معلّمة جديدة
              </button>
            </p>
          </form>
        )}

        {!ownerMode && tab === 'teacher' && registerMode && (
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
            <p style={{ textAlign: 'center', marginTop: spacing.sm, marginBottom: 0 }}>{forgotPasswordButton}</p>
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
