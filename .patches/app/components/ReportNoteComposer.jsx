import { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { createNote } from '../lib/adminNotesApi.js';
import { colors, radius } from '../lib/theme.js';

export default function ReportNoteComposer({ schoolId, reportTarget, teachers = [], assignments = [], onOpenNotes }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('action');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const t = teachers.find(item => item.uid === reportTarget.teacherUid);
  const assignment = assignments.find(a => a.id === reportTarget.assignmentId && a.teacherUid === reportTarget.teacherUid);
  const context = [reportTarget.className, reportTarget.subject, reportTarget.weekName].filter(Boolean).join(' · ').slice(0, 600);
  const buttonStyle = { padding: '9px 14px', borderRadius: radius.button, border: 'none', background: colors.primary, color: '#fff', cursor: 'pointer' };

  async function save(e) {
    e.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (!t || t.disabled) throw new Error('تعذّر تحديد المعلمة المسؤولة عن التقرير.');
      await createNote(schoolId, profile, {
        teacherUid: t.uid, teacherName: t.displayName || 'المعلمة',
        assignmentId: assignment?.id || '', context, kind, text: text.trim(),
      });
      setText('');
      setMessage('حُفظ التعليق وربط بالمعلمة وسياق التقرير، ويظهر في ملاحظات الإدارة.');
    } catch (err) {
      setError(err?.code === 'permission-denied'
        ? 'تعذّر حفظ التعليق. تأكدي من نشر صلاحيات ملاحظات الإدارة في Firebase.'
        : err.message || 'تعذّر حفظ التعليق.');
    } finally { setBusy(false); }
  }

  return <section dir="rtl" style={{ margin: '14px auto', maxWidth: 900, padding: 14, border: '1px solid ' + colors.border, borderRadius: radius.card }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <strong>تقرير: {reportTarget.className || 'الفصل'} — {t?.displayName || reportTarget.teacherName || 'المعلمة'}</strong>
      <button type="button" style={buttonStyle} onClick={() => { setOpen(v => !v); setError(''); }}>
        {open ? 'إخفاء التعليق' : 'إضافة تعليق على التقرير'}
      </button>
    </div>
    {open && <form onSubmit={save} style={{ marginTop: 12 }}>
      <p style={{ fontSize: 13, color: colors.textMuted }}>سيُربط التعليق تلقائيًا بالمعلمة والفصل والمادة والأسبوع الظاهر في التقرير: {context || 'تقرير الفصل'}</p>
      <label style={{ display: 'block', marginBottom: 10 }}>نوع التعليق
        <select value={kind} onChange={e => setKind(e.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 5 }}>
          <option value="action">يتطلب متابعة</option><option value="info">للاطلاع فقط</option>
        </select>
      </label>
      <label style={{ display: 'block' }}>ملاحظة الإدارة
        <textarea required rows={3} maxLength={2000} value={text} onChange={e => setText(e.target.value)}
          style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, marginTop: 5, font: 'inherit' }} />
      </label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
        <button type="submit" disabled={busy || !text.trim() || !t} style={buttonStyle}>{busy ? 'جارٍ الحفظ…' : 'حفظ التعليق وإشعار المعلمة'}</button>
        <button type="button" onClick={onOpenNotes} style={{ ...buttonStyle, background: '#efefef', color: colors.ink }}>عرض الملاحظات والمتابعة</button>
      </div>
    </form>}
    {message && <p role="status" style={{ color: '#0b5c33' }}>{message}</p>}
    {error && <p role="alert" style={{ color: colors.red }}>{error}</p>}
  </section>;
}
