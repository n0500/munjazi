import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { watchNotes, createNote, respondToNote, serverTimestamp } from '../lib/adminNotesApi.js';
import { noteWhatsAppUrl } from '../lib/noteWhatsApp.js';
import { colors, radius } from '../lib/theme.js';
const box = { padding: 16, border: `1px solid ${colors.border}`, borderRadius: radius.card, marginBottom: 12 };
const field = { display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, margin: '6px 0 12px', font: 'inherit' };
const button = { padding: '9px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.primary, color: '#fff', cursor: 'pointer' };
const errorText = err => err?.code === 'permission-denied' ? 'تعذر الوصول إلى الملاحظات. يلزم تفعيل صلاحيات ملاحظات الإدارة في قاعدة البيانات.' : 'تعذر الاتصال أو حفظ التغيير. حاولي مرة أخرى.';
function NoteCard({ note, schoolId, isAdmin }) {
  const [reply, setReply] = useState(note.reply || '');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(isAdmin);
  const [whatsApp, setWhatsApp] = useState('');
  useEffect(() => setReply(note.reply || ''), [note.reply]);
  async function update(changes) {
    if (busy) return;
    setBusy(true); setError('');
    try { await respondToNote(schoolId, note.id, changes); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  return <article style={box}>
    <strong>{isAdmin ? note.teacherName : note.adminName}</strong>
    <p>{note.context || 'ملاحظة عامة'} · {note.kind === 'action' ? 'يتطلب إجراء' : 'للاطلاع'}</p>
    <small>{note.createdAt?.toDate?.().toLocaleString('ar-SA') || 'جارٍ تأكيد الحفظ…'} · {note.completedAt ? 'تم الإجراء' : note.readAt ? 'تم الاطلاع' : 'جديدة'}</small>
    {!expanded && <div><button style={button} disabled={busy} onClick={() => { setExpanded(true); if (!note.readAt) update({ readAt: serverTimestamp() }); }}>عرض الملاحظة</button></div>}
    {expanded && <>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.text}</p>
      {isAdmin ? <>
        {note.reply && <p style={{ whiteSpace: 'pre-wrap' }}>رد المعلمة: {note.reply}</p>}
        <label>رقم واتساب المعلمة<input style={field} type="tel" dir="ltr" placeholder="05xxxxxxxx" value={phone} onChange={e => { setPhone(e.target.value); setWhatsApp(''); }} /></label>
        <button style={button} onClick={() => { try { setWhatsApp(noteWhatsAppUrl(phone, note, window.location.href)); setError(''); } catch(e) { setError(e.message); } }}>تجهيز رسالة واتساب</button>
        {whatsApp && <div style={{ marginTop: 12 }}><p>ستتضمن الرسالة اسم المعلمة والملاحظة أعلاه ورابط منجزي. تأكدي من الرقم قبل الإرسال.</p><a style={{ ...button, display: 'inline-block' }} href={whatsApp} target="_blank" rel="noopener noreferrer">إرسال لها بالواتساب</a><p><small>يفتح واتساب برسالة جاهزة؛ يتم الإرسال بعد ضغطك على إرسال داخل واتساب.</small></p></div>}
      </> : <>
        {!note.readAt && <button style={button} disabled={busy} onClick={() => update({ readAt: serverTimestamp() })}>تأكيد الاطلاع</button>}
        <label>ردك على الإدارة<textarea style={field} rows={3} maxLength={2000} value={reply} onChange={e => setReply(e.target.value)} /></label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button style={button} disabled={busy || !reply.trim() || reply.trim() === note.reply} onClick={() => update({ reply: reply.trim(), repliedAt: serverTimestamp(), ...(!note.readAt ? { readAt: serverTimestamp() } : {}) })}>حفظ الرد</button>
        {note.kind === 'action' && !note.completedAt && <button style={button} disabled={busy} onClick={() => update({ completedAt: serverTimestamp(), ...(!note.readAt ? { readAt: serverTimestamp() } : {}) })}>تم الإجراء</button>}</div>
      </>}
    </>}
    {error && <p role="alert" style={{ color: colors.red }}>{error}</p>}
  </article>;
}
export default function AdminNotes({ schoolId, teachers = [], assignments = [], classes = [], isAdmin = false }) {
  const { profile } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(isAdmin || new URLSearchParams(window.location.search).get('notes') === '1');
  const [teacherUid, setTeacherUid] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [week, setWeek] = useState('');
  const [kind, setKind] = useState('info');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  useEffect(() => {
    setLoading(true); setError(''); setNotes([]);
    return watchNotes(schoolId, isAdmin ? null : profile.uid, rows => { setNotes(rows); setLoading(false); }, e => { setError(errorText(e)); setLoading(false); });
  }, [schoolId, profile.uid, isAdmin]);
  async function save(e) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const teacher = teachers.find(t => t.uid === teacherUid);
      if (!teacher || teacher.disabled) throw new Error('invalid-teacher');
      const a = assignments.find(a => a.id === assignmentId && a.teacherUid === teacherUid);
      const context = [a ? `${classes.find(c => c.id === a.classId)?.name || ''} — ${a.subject || ''}` : '', week.trim()].filter(Boolean).join(' · ');
      await createNote(schoolId, profile, { teacherUid, teacherName: teacher.displayName || 'المعلمة', assignmentId: a?.id || '', context, kind, text });
      setText(''); setSuccess('تم حفظ الملاحظة. ستظهر للمعلمة داخل منجزي، ويمكنك تجهيز رسالة واتساب من البطاقة أدناه.');
    } catch(e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const unread = notes.filter(n => !n.readAt).length;
  return <section dir="rtl" style={{ margin: '16px 0' }}>
    <button style={{ ...button, width: '100%', textAlign: 'right' }} aria-expanded={open} onClick={() => setOpen(!open)}>ملاحظات الإدارة {loading ? '…' : unread ? `(${unread} غير مقروءة)` : `(${notes.length})`}{error ? ' — تعذر التحديث' : ''}</button>
    {open && <div style={{ marginTop: 12 }}>
      {isAdmin && <form onSubmit={save} style={box}>
        <h3>إضافة ملاحظة للمعلمة</h3>
        <label>المعلمة<select style={field} required value={teacherUid} onChange={e => { setTeacherUid(e.target.value); setAssignmentId(''); }}><option value="">اختاري المعلمة</option>{teachers.filter(t => !t.disabled).map(t => <option key={t.uid} value={t.uid}>{t.displayName}</option>)}</select></label>
        <label>الفصل والمادة (اختياري)<select style={field} value={assignmentId} onChange={e => setAssignmentId(e.target.value)}><option value="">ملاحظة عامة</option>{assignments.filter(a => a.teacherUid === teacherUid).map(a => <option key={a.id} value={a.id}>{classes.find(c => c.id === a.classId)?.name} — {a.subject}</option>)}</select></label>
        <label>الأسبوع أو التقرير (اختياري)<input style={field} value={week} maxLength={120} onChange={e => setWeek(e.target.value)} /></label>
        <label>نوع الملاحظة<select style={field} value={kind} onChange={e => setKind(e.target.value)}><option value="info">للاطلاع</option><option value="action">يتطلب إجراء</option></select></label>
        <label>الملاحظة<textarea style={field} required rows={4} maxLength={2000} value={text} onChange={e => setText(e.target.value)} /></label>
        <button style={button} disabled={busy || !text.trim() || !teacherUid}>{busy ? 'جارٍ الحفظ…' : 'حفظ وإشعار المعلمة داخل منجزي'}</button>
      </form>}
      {error && <p role="alert" style={{ color: colors.red }}>{error}</p>}
      {success && <p role="status">{success}</p>}
      {loading ? <p>جارٍ تحميل الملاحظات…</p> : !error && notes.length === 0 ? <p>لا توجد ملاحظات حتى الآن.</p> : null}
      {notes.filter(n => !isAdmin || !teacherUid || n.teacherUid === teacherUid).map(n => <NoteCard key={n.id} note={n} schoolId={schoolId} isAdmin={isAdmin} />)}
    </div>}
  </section>;
}
