import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { watchNotes, createNote, respondToNote, serverTimestamp } from '../lib/adminNotesApi.js';
import { noteWhatsAppUrl } from '../lib/noteWhatsApp.js';
import { cachedContactNumbers, watchContactNumbers, saveContactNumber } from '../lib/adminContactsApi.js';
import { colors, radius } from '../lib/theme.js';
import { needsFollowUp, isFinished } from '../lib/noteStatus.js';

const box = { padding: 16, border: `1px solid ${colors.border}`, borderRadius: radius.card, marginBottom: 12 };
const field = { display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, margin: '6px 0 12px', font: 'inherit' };
const button = { padding: '9px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.primary, color: '#fff', cursor: 'pointer' };
const secondary = { ...button, background: '#f5f5f5', color: colors.ink };
const errorText = err => err?.code === 'permission-denied'
  ? 'تعذّر الوصول إلى الملاحظات. يلزم تفعيل صلاحيات ملاحظات الإدارة في Firebase.'
  : (err?.message || 'تعذّر الاتصال أو حفظ التغيير. حاولي مرة أخرى.');


function NoteCard({ note, schoolId, isAdmin, savedPhone = '', onSavePhone, contactMode }) {
  const [reply, setReply] = useState(note.reply || '');
  const [phone, setPhone] = useState(savedPhone);
  const [busy, setBusy] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneNotice, setPhoneNotice] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [whatsApp, setWhatsApp] = useState('');
  useEffect(() => setReply(note.reply || ''), [note.reply]);
  useEffect(() => setPhone(savedPhone || ''), [savedPhone]);

  async function update(changes) {
    if (busy) return;
    setBusy(true); setError('');
    try { await respondToNote(schoolId, note.id, changes); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  async function savePhone() {
    if (savingPhone) return;
    setSavingPhone(true); setError(''); setPhoneNotice('');
    try {
      const result = await onSavePhone(note.teacherUid, phone);
      setPhone(result.phone);
      setPhoneNotice(result.shared ? 'حُفظ الرقم لجميع جلسات إدارة المدرسة.' : 'حُفظ الرقم على هذا الجهاز فقط؛ يلزم نشر صلاحيات أرقام التواصل في Firebase للمزامنة.');
    } catch (e) { setError(e.message || 'تعذّر حفظ رقم الجوال.'); }
    finally { setSavingPhone(false); }
  }
  const status = note.completedAt ? 'تم الإجراء' : !note.readAt ? 'لم يُطّلع عليها' : note.kind === 'action' ? 'بانتظار الإجراء' : 'تم الاطلاع';
  return <article style={box}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
      <strong>{isAdmin ? note.teacherName : note.adminName}</strong>
      <span style={{ color: needsFollowUp(note) ? colors.red : colors.textMuted, fontSize: 12 }}>{status}</span>
    </div>
    <p style={{ margin: '6px 0', fontSize: 13 }}>{note.context || 'ملاحظة عامة'} · {note.kind === 'action' ? 'يتطلب إجراء' : 'للاطلاع'}</p>
    <small>{note.createdAt?.toDate?.().toLocaleString('ar-SA') || 'جارٍ تأكيد الحفظ…'}</small>
    <div style={{ marginTop: 8 }}>
      <button type="button" style={secondary} disabled={busy} aria-expanded={expanded}
        onClick={() => { setExpanded(v => !v); if (!expanded && !isAdmin && !note.readAt) update({ readAt: serverTimestamp() }); }}>
        {expanded ? 'إخفاء التفاصيل' : 'عرض الملاحظة والتفاصيل'}
      </button>
    </div>
    {expanded && <>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.text}</p>
      {isAdmin ? <>
        {note.reply && <p style={{ whiteSpace: 'pre-wrap' }}>رد المعلمة: {note.reply}</p>}
        <label>رقم واتساب المعلمة
          <input style={field} type="tel" dir="ltr" placeholder="05xxxxxxxx" value={phone}
            onChange={e => { setPhone(e.target.value); setWhatsApp(''); setPhoneNotice(''); }} />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={secondary} onClick={savePhone} disabled={savingPhone || !phone.trim()}>
            {savingPhone ? 'جارٍ الحفظ…' : 'حفظ رقم المعلمة'}
          </button>
          <button type="button" style={button} onClick={() => {
            try { setWhatsApp(noteWhatsAppUrl(phone, note, window.location.href)); setError(''); }
            catch (e) { setError(e.message); }
          }}>تجهيز رسالة واتساب</button>
        </div>
        {savedPhone && <small style={{ display: 'block', marginTop: 7 }}>رقم محفوظ {contactMode === 'shared' ? 'في المدرسة' : 'على هذا الجهاز'}</small>}
        {phoneNotice && <p role="status" style={{ color: '#0b5c33' }}>{phoneNotice}</p>}
        {whatsApp && <div style={{ marginTop: 12 }}>
          <p>ستتضمن الرسالة اسم المعلمة والملاحظة ورابط منجزي. تأكدي من الرقم قبل الإرسال.</p>
          <a style={{ ...button, display: 'inline-block' }} href={whatsApp} target="_blank" rel="noopener noreferrer">إرسال لها بالواتساب</a>
          <p><small>يفتح واتساب برسالة جاهزة؛ لا تُرسل إلا بعد موافقتك داخل واتساب.</small></p>
        </div>}
      </> : <>
        {!note.readAt && <button type="button" style={button} disabled={busy} onClick={() => update({ readAt: serverTimestamp() })}>تأكيد الاطلاع</button>}
        <label>ردك على الإدارة
          <textarea style={field} rows={3} maxLength={2000} value={reply} onChange={e => setReply(e.target.value)} />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={button} disabled={busy || !reply.trim() || reply.trim() === note.reply}
            onClick={() => update({ reply: reply.trim(), repliedAt: serverTimestamp(), ...(!note.readAt ? { readAt: serverTimestamp() } : {}) })}>حفظ الرد</button>
          {note.kind === 'action' && !note.completedAt &&
            <button type="button" style={button} disabled={busy}
              onClick={() => update({ completedAt: serverTimestamp(), ...(!note.readAt ? { readAt: serverTimestamp() } : {}) })}>تم الإجراء</button>}
        </div>
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
  const [filter, setFilter] = useState(isAdmin ? 'pending' : 'all');
  const [teacherUid, setTeacherUid] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [week, setWeek] = useState('');
  const [kind, setKind] = useState('info');
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');

  const [contacts, setContacts] = useState(() => isAdmin ? cachedContactNumbers(schoolId) : {});
  const [contactMode, setContactMode] = useState('loading');
  const [contactTeacherUid, setContactTeacherUid] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactSaving, setContactSaving] = useState(false);
  const [contactMessage, setContactMessage] = useState('');

  useEffect(() => {
    setLoading(true); setError(''); setNotes([]);
    return watchNotes(schoolId, isAdmin ? null : profile.uid, rows => { setNotes(rows); setLoading(false); }, e => { setError(errorText(e)); setLoading(false); });
  }, [schoolId, profile.uid, isAdmin]);
  useEffect(() => {
    if (!isAdmin) return undefined;
    return watchContactNumbers(schoolId, setContacts, setContactMode);
  }, [schoolId, isAdmin]);
  useEffect(() => {
    setContactPhone(contacts[contactTeacherUid] || '');
  }, [contactTeacherUid, contacts[contactTeacherUid]]);

  async function saveContact(uid, phone) {
    const teacher = teachers.find(t => t.uid === uid && !t.disabled);
    if (!teacher) throw new Error('اختاري معلمة نشطة.');
    const result = await saveContactNumber(schoolId, uid, phone, profile.uid);
    setContacts(prev => ({ ...prev, [uid]: result.phone }));
    return result;
  }
  async function saveDirectory(e) {
    e.preventDefault();
    if (contactSaving) return;
    setContactSaving(true); setContactMessage('');
    try {
      const result = await saveContact(contactTeacherUid, contactPhone);
      setContactPhone(result.phone);
      setContactMessage(result.shared
        ? 'حُفظ الرقم في دليل المدرسة وسيظهر تلقائيًا في ملاحظات هذه المعلمة.'
        : 'حُفظ الرقم على هذا الجهاز فقط. للمزامنة بين الأجهزة، انشري قواعد أرقام التواصل في Firebase.');
    } catch (e) { setContactMessage(e.message || 'تعذّر حفظ الرقم.'); }
    finally { setContactSaving(false); }
  }
  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const teacher = teachers.find(t => t.uid === teacherUid);
      if (!teacher || teacher.disabled) throw new Error('اختاري معلمة نشطة.');
      const assignment = assignments.find(a => a.id === assignmentId && a.teacherUid === teacherUid);
      const context = [assignment ? `${classes.find(c => c.id === assignment.classId)?.name || ''} — ${assignment.subject || ''}` : '', week.trim()]
        .filter(Boolean).join(' · ').slice(0, 600);
      await createNote(schoolId, profile, {
        teacherUid, teacherName: teacher.displayName || 'المعلمة',
        assignmentId: assignment?.id || '', context, kind, text: noteText.trim(),
      });
      setNoteText(''); setFilter('pending');
      setSuccess('تم حفظ الملاحظة. ستظهر للمعلمة، ويمكنك تجهيز رسالة واتساب من البطاقة أدناه.');
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  const unread = notes.filter(n => !n.readAt).length;
  const pendingCount = notes.filter(needsFollowUp).length;
  const completedCount = notes.filter(isFinished).length;
  const shown = notes.filter(n => filter === 'all' || (filter === 'pending' ? needsFollowUp(n) : isFinished(n)));

  return <section dir="rtl" style={{ margin: '16px 0' }}>
    <button type="button" style={{ ...button, width: '100%', textAlign: 'right' }} aria-expanded={open} onClick={() => setOpen(!open)}>
      ملاحظات الإدارة {loading ? '…' : `(${unread} غير مقروءة · ${pendingCount} بانتظار المتابعة)`}{error ? ' — تعذّر التحديث' : ''}
    </button>
    {open && <div style={{ marginTop: 12 }}>
      {isAdmin && <>
        <details style={box}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>دليل أرقام واتساب المعلمات ({Object.keys(contacts).length} محفوظ)</summary>
          <p style={{ fontSize: 13 }}>احفظي رقم كل معلمة مرة واحدة، وسيُستخدم تلقائيًا عند إرسال ملاحظاتها.</p>
          <form onSubmit={saveDirectory}>
            <label>المعلمة
              <select style={field} required value={contactTeacherUid} onChange={e => { setContactTeacherUid(e.target.value); setContactMessage(''); }}>
                <option value="">اختاري المعلمة</option>
                {teachers.filter(t => !t.disabled).map(t => <option value={t.uid} key={t.uid}>{t.displayName}</option>)}
              </select>
            </label>
            <label>رقم الواتساب
              <input type="tel" dir="ltr" style={field} required placeholder="05xxxxxxxx" value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
            </label>
            <button style={button} type="submit" disabled={contactSaving || !contactTeacherUid || !contactPhone.trim()}>
              {contactSaving ? 'جارٍ الحفظ…' : 'حفظ / تحديث الرقم'}
            </button>
          </form>
          {contactMessage && <p role="status">{contactMessage}</p>}
          <p style={{ fontSize: 12, color: colors.textMuted }}>
            {contactMode === 'shared' ? 'الأرقام محفوظة في المدرسة وتُزامن بين الأجهزة.' :
              contactMode === 'loading' ? 'جارٍ التحقق من مزامنة الأرقام…' :
              'الأرقام المحلية متاحة، لكن المزامنة غير مفعّلة. يلزم نشر قواعد أرقام التواصل في Firebase.'}
          </p>
        </details>
        <form onSubmit={save} style={box}>
          <h3>إضافة ملاحظة للمعلمة</h3>
          <label>المعلمة<select style={field} required value={teacherUid}
            onChange={e => { setTeacherUid(e.target.value); setAssignmentId(''); }}>
            <option value="">اختاري المعلمة</option>
            {teachers.filter(t => !t.disabled).map(t => <option key={t.uid} value={t.uid}>{t.displayName}</option>)}
          </select></label>
          <label>الفصل والمادة (اختياري)<select style={field} value={assignmentId} onChange={e => setAssignmentId(e.target.value)}>
            <option value="">ملاحظة عامة</option>
            {assignments.filter(a => a.teacherUid === teacherUid).map(a =>
              <option key={a.id} value={a.id}>{classes.find(c => c.id === a.classId)?.name} — {a.subject}</option>)}
          </select></label>
          <label>الأسبوع أو التقرير (اختياري)<input style={field} value={week} maxLength={120} onChange={e => setWeek(e.target.value)} /></label>
          <label>نوع الملاحظة<select style={field} value={kind} onChange={e => setKind(e.target.value)}>
            <option value="info">للاطلاع</option><option value="action">يتطلب إجراء</option>
          </select></label>
          <label>الملاحظة<textarea style={field} required rows={4} maxLength={2000} value={noteText} onChange={e => setNoteText(e.target.value)} /></label>
          <button type="submit" style={button} disabled={busy || !noteText.trim() || !teacherUid}>
            {busy ? 'جارٍ الحفظ…' : 'حفظ وإشعار المعلمة داخل منجزي'}
          </button>
        </form>
      </>}
      {error && <p role="alert" style={{ color: colors.red }}>{error}</p>}
      {success && <p role="status" style={{ color: '#0b5c33' }}>{success}</p>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" style={filter === 'pending' ? button : secondary} onClick={() => setFilter('pending')}>
          بانتظار المتابعة ({pendingCount})
        </button>
        <button type="button" style={filter === 'all' ? button : secondary} onClick={() => setFilter('all')}>
          جميع الملاحظات ({notes.length})
        </button>
        <button type="button" style={filter === 'done' ? button : secondary} onClick={() => setFilter('done')}>
          المكتملة ({completedCount})
        </button>
      </div>
      {loading ? <p>جارٍ تحميل الملاحظات…</p> : !error && shown.length === 0
        ? <p>{filter === 'pending' ? 'لا توجد ملاحظات بانتظار المتابعة.' : 'لا توجد ملاحظات في هذه القائمة.'}</p>
        : shown.filter(n => !isAdmin || !teacherUid || n.teacherUid === teacherUid).map(n =>
          <NoteCard key={n.id} note={n} schoolId={schoolId} isAdmin={isAdmin}
            savedPhone={contacts[n.teacherUid] || ''} onSavePhone={saveContact} contactMode={contactMode} />)}
    </div>}
  </section>;
}
