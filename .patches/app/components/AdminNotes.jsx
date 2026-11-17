import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { watchNotes, respondToNote, serverTimestamp } from '../lib/adminNotesApi.js';
import { noteWhatsAppUrl } from '../lib/noteWhatsApp.js';
import { cachedContactNumbers, watchContactNumbers, saveContactNumber } from '../lib/adminContactsApi.js';
import { colors, radius } from '../lib/theme.js';
import { needsFollowUp, isFinished } from '../lib/noteStatus.js';
import { loadAutoNoteStatuses, readAutoContext, visibleNoteContext, AUTO_ACTIONS } from '../lib/autoNoteTracking.js';

const box = { padding: 16, border: `1px solid ${colors.border}`, borderRadius: radius.card, marginBottom: 12 };
const field = { display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, margin: '6px 0 12px', font: 'inherit' };
const button = { padding: '9px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.primary, color: '#fff', cursor: 'pointer' };
const secondary = { ...button, background: '#f5f5f5', color: colors.ink };
// Completed automatic checks are cached on the device so they are not re-read from Firestore on every visit.
const AUTO_CACHE = schoolId => 'munjazi:autoNotes:' + schoolId;
function readAutoCache(schoolId) {
  try { return JSON.parse(localStorage.getItem(AUTO_CACHE(schoolId)) || '{}') || {}; } catch { return {}; }
}
function writeAutoCache(schoolId, cache) {
  try { localStorage.setItem(AUTO_CACHE(schoolId), JSON.stringify(cache)); } catch { /* storage unavailable */ }
}
// WhatsApp sending is switched off for now; set to true to bring back the buttons and the numbers directory.
const WHATSAPP_ENABLED = false;
const AUTO_REFRESH_MIN_MS = 10 * 60 * 1000;
// For the teacher, a note that cannot be verified automatically is not her fault and must not raise a red alert.
const teacherAttention = note => needsFollowUp(note) && note.autoState !== 'unverified';
const errorText = err => err?.code === 'permission-denied'
  ? 'تعذّر الوصول إلى الملاحظات. يلزم تفعيل صلاحيات ملاحظات الإدارة في Firebase.'
  : (err?.message || 'تعذّر الاتصال أو حفظ التغيير. حاولي مرة أخرى.');


function NoteCard({ note, schoolId, isAdmin, savedPhone = '', onSavePhone, contactMode, onOpenReport }) {
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
  const tracked = readAutoContext(note.context);
  const auto = note.autoResult;
  const status = tracked ? (auto?.state === 'complete' ? 'تم التنفيذ وفق بيانات منجزي' : auto?.state === 'progress' ? 'جارٍ التنفيذ' : auto?.state === 'unverified' ? 'تعذّر التحقق آليًا' : 'بانتظار التنفيذ')
    : note.completedAt ? 'أفادت المعلمة بإتمام الإجراء' : !note.readAt ? 'لم يُطّلع عليها' : note.kind === 'action' ? 'بانتظار الإجراء' : 'تم الاطلاع';
  const attention = !isAdmin && teacherAttention(note);
  const unread = !isAdmin && !note.readAt;
  return <article style={{ ...box, borderColor: attention ? '#d77a74' : unread ? '#d9ac5c' : colors.border, borderRight: attention ? '4px solid #b9433b' : unread ? '4px solid #c18a32' : undefined, background: attention ? '#fff8f7' : unread ? '#fffbf3' : '#fff' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
      <strong>{isAdmin ? note.teacherName : note.adminName}</strong>
      <span style={{ color: needsFollowUp(note) ? '#a82e2a' : colors.textMuted, fontSize: 12, fontWeight: 700 }}>{status}</span>
    </div>
    <p style={{ margin: '6px 0', fontSize: 13 }}>{visibleNoteContext(note.context) || 'ملاحظة عامة'} · {note.kind === 'action' ? 'يتطلب إجراء' : 'للاطلاع'}</p>
    <small>{note.createdAt?.toDate?.().toLocaleString('ar-SA') || 'جارٍ تأكيد الحفظ…'}</small>
    <div style={{ marginTop: 8 }}>
      <button type="button" style={secondary} disabled={busy} aria-expanded={expanded}
        onClick={() => { setExpanded(v => !v); if (!expanded && !isAdmin && !note.readAt) update({ readAt: serverTimestamp() }); }}>
        {expanded ? 'إخفاء التفاصيل' : 'عرض الملاحظة والتفاصيل'}
      </button>
    </div>
    {expanded && <>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.text}</p>
      {tracked && <div style={{ margin: '10px 0', padding: 12, background: auto?.state === 'complete' ? '#eff8f2' : '#f5f7f6', borderRadius: 8, fontSize: 13 }}>
        <strong>متابعة آلية: {AUTO_ACTIONS[tracked.action]}</strong>
        <p style={{ margin: '6px 0' }}>{status}{auto?.reason ? ' — ' + auto.reason : ''}</p>
        {auto?.evidence && <div>
          <span>الشاهد: {auto.evidence.weekName} ({auto.evidence.recorded} من {auto.evidence.total} رصدًا)</span>
          {onOpenReport && <button type="button" style={{ ...secondary, marginRight: 8, padding: '6px 9px' }} onClick={() => onOpenReport({ classId: auto.evidence.classId, teacherUid: auto.evidence.teacherUid, assignmentId: note.assignmentId, className: visibleNoteContext(note.context).split(' · ')[0], weekId: auto.evidence.weekId, weekName: auto.evidence.weekName, weekType: auto.evidence.weekType, teacherName: note.teacherName, direct: true })}>فتح الشاهد</button>}
        </div>}
      </div>}
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
          {note.kind === 'action' && !tracked && !note.completedAt &&
            <button type="button" style={button} disabled={busy}
              onClick={() => update({ completedAt: serverTimestamp(), ...(!note.readAt ? { readAt: serverTimestamp() } : {}) })}>تم الإجراء</button>}
        </div>
      </>}
    </>}
    {error && <p role="alert" style={{ color: colors.red }}>{error}</p>}
  </article>;
}

const fmtTime = ts => ts?.toDate?.().toLocaleString('ar-SA') || '';
function adminStatus(note) {
  if (readAutoContext(note.context)) {
    return note.autoState === 'complete' ? 'تم التنفيذ وفق بيانات منجزي' : note.autoState === 'progress' ? 'جارٍ التنفيذ'
      : note.autoState === 'unverified' ? 'تعذّر التحقق آليًا' : 'بانتظار التنفيذ';
  }
  if (note.kind === 'action') return note.completedAt ? 'أفادت المعلمة بإتمام الإجراء' : 'بانتظار الإجراء';
  return note.readAt ? 'تم الاطلاع' : 'لم يُطّلع عليها';
}
const chip = { padding: '6px 11px', borderRadius: 8, border: `1px solid ${colors.border}`, background: '#fff', color: colors.ink, cursor: 'pointer', fontSize: 13, textDecoration: 'none', display: 'inline-block' };

// Admin card: compact summary, details on demand, one-tap WhatsApp from the saved directory number.
function AdminNoteCard({ note, savedPhone = '', onNeedPhone, onOpenReport }) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const tracked = readAutoContext(note.context);
  const auto = note.autoResult;
  const status = adminStatus(note);
  const pending = needsFollowUp(note);
  const accent = pending ? (note.autoState === 'unverified' ? '#9aa39e' : '#b9433b') : '#2f8a5b';
  let whatsAppUrl = '';
  if (savedPhone) { try { whatsAppUrl = noteWhatsAppUrl(savedPhone, note, window.location.href); } catch { whatsAppUrl = ''; } }
  const readLine = !note.readAt ? 'لم تطّلع بعد' : note.reply ? 'اطّلعت وردّت' : 'اطّلعت · لا يوجد رد';
  return <article style={{ border: `1px solid ${colors.border}`, borderRight: `4px solid ${accent}`, borderRadius: 10, padding: 12, marginBottom: 10, background: '#fff' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <strong>{note.teacherName}</strong>
      <span style={{ fontSize: 12, fontWeight: 700, color: pending ? '#a82e2a' : '#0b6b3b' }}>{status}</span>
    </div>
    <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>{visibleNoteContext(note.context) || 'ملاحظة عامة'} · {note.kind === 'action' ? 'يتطلب إجراء' : 'للاطلاع'}</div>
    <div style={{ fontSize: 12, marginTop: 3, color: note.readAt ? colors.textMuted : '#94641e' }}>{readLine}</div>
    <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
      <button type="button" style={chip} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? 'إخفاء التفاصيل' : 'التفاصيل'}</button>
      {WHATSAPP_ENABLED && (whatsAppUrl
        ? <a style={chip} href={whatsAppUrl} target="_blank" rel="noopener noreferrer">واتساب</a>
        : <button type="button" style={chip} onClick={() => { setError(''); onNeedPhone(note.teacherUid); }}>واتساب</button>)}
    </div>
    {expanded && <div style={{ marginTop: 10, borderTop: `1px solid ${colors.border}`, paddingTop: 10, fontSize: 13 }}>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '0 0 4px', fontSize: 14 }}>{note.text}</p>
      <small style={{ color: colors.textMuted }}>أُرسلت: {fmtTime(note.createdAt) || 'جارٍ تأكيد الحفظ…'}</small>
      {tracked && <div style={{ margin: '10px 0', padding: 10, background: auto?.state === 'complete' ? '#eff8f2' : '#f5f7f6', borderRadius: 8 }}>
        <strong>متابعة آلية: {AUTO_ACTIONS[tracked.action]}</strong>
        <div style={{ margin: '5px 0' }}>{status}{auto?.reason ? ' — ' + auto.reason : ''}</div>
        {auto?.evidence && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>الشاهد: {auto.evidence.weekName} ({auto.evidence.recorded} من {auto.evidence.total} رصدًا)</span>
          {onOpenReport && <button type="button" style={{ ...chip, padding: '5px 9px' }} onClick={() => onOpenReport({ ...auto.evidence, assignmentId: note.assignmentId, teacherName: note.teacherName, className: visibleNoteContext(note.context).split(' · ')[0], direct: true })}>فتح الشاهد</button>}
        </div>}
      </div>}
      <div style={{ marginTop: 8 }}>{note.readAt ? 'اطّلعت المعلمة: ' + fmtTime(note.readAt) : 'لم تطّلع المعلمة بعد'}</div>
      {note.completedAt && <div style={{ marginTop: 4 }}>أفادت بإتمام الإجراء: {fmtTime(note.completedAt)}</div>}
      {note.reply && <div style={{ marginTop: 8, padding: 10, background: '#f7faf8', borderRadius: 8 }}>
        <strong>رد المعلمة</strong>{note.repliedAt && <small style={{ color: colors.textMuted }}> · {fmtTime(note.repliedAt)}</small>}
        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 4 }}>{note.reply}</div>
      </div>}
    </div>}
    {error && <p role="alert" style={{ color: colors.red }}>{error}</p>}
  </article>;
}

export default function AdminNotes({ schoolId, teachers = [], assignments = [], classes = [], isAdmin = false, onOpenReport }) {
  const { profile } = useAuth();
  const [notes, setNotes] = useState([]);
  const [autoStatuses, setAutoStatuses] = useState({});
  const [autoChecking, setAutoChecking] = useState(false);
  const [autoError, setAutoError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [reportTeacher, setReportTeacher] = useState('');
  const [showContacts, setShowContacts] = useState(false);
  const contactsRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(isAdmin || new URLSearchParams(window.location.search).get('notes') === '1');
  const [filter, setFilter] = useState(isAdmin ? 'pending' : 'all');

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
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const forceRef = useRef(false);
  const lastCheckRef = useRef(0);
  // Re-check only when tracked notes are added, not on every read or reply.
  const trackedKey = notes.filter(n => n.kind === 'action' && readAutoContext(n.context))
    .map(n => n.id + ':' + (n.createdAt?.seconds || 0)).join('|');
  useEffect(() => {
    // Returning to the page refreshes at most once every ten minutes; no periodic polling.
    const visibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheckRef.current > AUTO_REFRESH_MIN_MS) setRefreshTick(t => t + 1);
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    let active = true;
    const tracked = notesRef.current.filter(n => n.kind === 'action' && readAutoContext(n.context));
    if (!tracked.length) {
      setAutoStatuses({}); setAutoChecking(false); setAutoError('');
      return () => { active = false; };
    }
    const force = forceRef.current;
    forceRef.current = false;
    const cache = force ? {} : readAutoCache(schoolId);
    const cached = {};
    tracked.forEach(n => { if (cache[n.id]?.state === 'complete') cached[n.id] = cache[n.id]; });
    const toCheck = tracked.filter(n => !cached[n.id]);
    setAutoStatuses(prev => ({ ...prev, ...cached }));
    if (!toCheck.length) { setAutoChecking(false); return () => { active = false; }; }
    setAutoChecking(true); setAutoError('');
    lastCheckRef.current = Date.now();
    loadAutoNoteStatuses(schoolId, toCheck).then(results => {
      if (!active) return;
      const all = { ...cached, ...results };
      setAutoStatuses(all);
      const nextCache = {};
      tracked.forEach(n => { if (all[n.id]?.state === 'complete') nextCache[n.id] = all[n.id]; });
      writeAutoCache(schoolId, nextCache);
    }).catch(err => { if (active) setAutoError(err.message || 'تعذّر تحديث حالات المتابعة الآلية.'); })
      .finally(() => { if (active) setAutoChecking(false); });
    return () => { active = false; };
  }, [schoolId, trackedKey, refreshTick]);
    useEffect(() => {
    if (!isAdmin) return undefined;
    if (!WHATSAPP_ENABLED) return undefined;
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
  const enriched = notes.map(n => ({ ...n, autoResult: autoStatuses[n.id], autoState: autoStatuses[n.id]?.state }));
  const unread = enriched.filter(n => !n.readAt).length;
  const urgentCount = enriched.filter(n => n.kind === 'action' && (isAdmin ? needsFollowUp(n) : teacherAttention(n))).length;
  const infoUnread = enriched.filter(n => n.kind === 'info' && !n.readAt).length;
  const pendingCount = enriched.filter(needsFollowUp).length;
  const completedCount = enriched.filter(isFinished).length;
  const byTeacher = enriched.filter(n => !isAdmin || !reportTeacher || n.teacherUid === reportTeacher);
  const shown = byTeacher.filter(n => filter === 'all' || (filter === 'pending' ? needsFollowUp(n) : isFinished(n)));
  const reportRows = shown;
  function needPhone(uid) {
    setShowContacts(true); setContactTeacherUid(uid); setContactMessage('احفظي رقم واتساب المعلمة أولًا، ثم اضغطي «واتساب» على الملاحظة.');
    setTimeout(() => contactsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 50);
  }

  function printReport() {
    const popup = window.open('', '_blank');
    if (!popup) return;
    const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const rows = reportRows.map(n => '<tr><td>'+escape(n.teacherName)+'</td><td>'+escape(visibleNoteContext(n.context))+'</td><td>'+escape(n.kind === 'info' ? 'للاطلاع' : n.autoState === 'complete' ? 'تم التنفيذ وفق بيانات منجزي' : n.autoState === 'progress' ? 'جارٍ التنفيذ' : n.autoState === 'unverified' ? 'تعذّر التحقق' : n.kind === 'action' && !readAutoContext(n.context) && n.completedAt ? 'أفادت المعلمة بإتمام الإجراء' : 'بانتظار المتابعة')+'</td><td>'+escape(n.autoResult?.evidence?.weekName || '—')+'</td><td>'+escape(n.reply || '—')+'</td></tr>').join('');
    popup.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير متابعة الملاحظات الإدارية</title><style>body{font-family:Tahoma,Arial,sans-serif;color:#23352b;padding:22px}h1{text-align:center;font-size:21px}p{text-align:center}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ccd7d0;padding:8px;vertical-align:top}th{background:#e8f1eb}@page{size:A4 landscape;margin:12mm}@media print{button{display:none}}</style></head><body><h1>تقرير متابعة الملاحظات الإدارية — منجزي</h1><p>تقرير آلي بحسب بيانات الرصد المسجلة وقت الإصدار · مجموع الملاحظات: '+reportRows.length+'</p><table><thead><tr><th>المعلمة</th><th>سياق التقرير</th><th>حالة المتابعة</th><th>الشاهد</th><th>رد المعلمة</th></tr></thead><tbody>'+rows+'</tbody></table><p>تعني حالة «تم التنفيذ وفق بيانات منجزي» تحقق شروط الرصد الآلي، ولا تعني مراجعة إدارية مستقلة.</p><button onclick="window.print()">طباعة / حفظ PDF</button></body></html>');
    popup.document.close();
  }
  const filterBtn = (key, label) => <button type="button" style={filter === key ? button : secondary} onClick={() => setFilter(key)}>{label}</button>;
  if (isAdmin) return <section dir="rtl" style={{ margin: '16px 0' }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
      <button type="button" onClick={() => setFilter('pending')} style={{ textAlign: 'right', border: '1px solid #f0c9c5', background: '#fff5f3', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', color: '#8b2d29' }}>
        <div style={{ fontSize: 12 }}>بانتظار المتابعة</div><div style={{ fontSize: 22, fontWeight: 700 }}>{loading ? '…' : byTeacher.filter(needsFollowUp).length}</div>
      </button>
      <button type="button" onClick={() => setFilter('done')} style={{ textAlign: 'right', border: '1px solid #cfe6d8', background: '#f1f9f4', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', color: '#0b5c33' }}>
        <div style={{ fontSize: 12 }}>مكتملة</div><div style={{ fontSize: 22, fontWeight: 700 }}>{loading ? '…' : byTeacher.filter(isFinished).length}</div>
      </button>
    </div>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
      {filterBtn('pending', 'بانتظار المتابعة')}{filterBtn('done', 'المكتملة')}{filterBtn('all', 'الكل')}
      <select aria-label="تصفية حسب المعلمة" value={reportTeacher} onChange={e => setReportTeacher(e.target.value)}
        style={{ flex: '1 1 140px', minWidth: 0, padding: 9, borderRadius: 8, border: `1px solid ${colors.border}`, font: 'inherit', background: '#fff' }}>
        <option value="">جميع المعلمات</option>{teachers.map(t => <option key={t.uid} value={t.uid}>{t.displayName}</option>)}
      </select>
    </div>
    {error && <p role="alert" style={{ color: colors.red }}>{error}</p>}
    {autoError && <p role="alert" style={{ color: colors.red }}>{autoError}</p>}
    {loading ? <p>جارٍ تحميل الملاحظات…</p> : !error && shown.length === 0
      ? <p style={{ color: colors.textMuted, fontSize: 13 }}>{filter === 'pending' ? 'لا توجد ملاحظات بانتظار المتابعة.' : 'لا توجد ملاحظات في هذه القائمة.'} تُضاف الملاحظات من تبويب «متابعة المعلمات».</p>
      : shown.map(n => <AdminNoteCard key={n.id} note={n} savedPhone={contacts[n.teacherUid] || ''} onNeedPhone={needPhone} onOpenReport={onOpenReport} />)}
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, marginBottom: 12 }}>
      <button type="button" style={chip} onClick={printReport} disabled={!shown.length}>طباعة التقرير / PDF</button>
      <button type="button" style={chip} disabled={autoChecking} onClick={() => { forceRef.current = true; setRefreshTick(t => t + 1); }}>{autoChecking ? 'جارٍ التحقق…' : 'تحديث الحالات'}</button>
      {WHATSAPP_ENABLED && <button type="button" style={chip} aria-expanded={showContacts} onClick={() => setShowContacts(v => !v)}>أرقام المعلمات ({Object.keys(contacts).length})</button>}
    </div>
    {WHATSAPP_ENABLED && showContacts && <>
        <section ref={contactsRef} style={box}>
          <strong>أرقام واتساب المعلمات ({Object.keys(contacts).length} محفوظ)</strong>
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
        </section>
    </>}
  </section>;
  return <section dir="rtl" style={{ margin: '16px 0' }}>
    {!isAdmin && !loading && !error && urgentCount > 0 && <div role="status" style={{ border: '1px solid #d77a74', borderRight: '5px solid #b9433b', borderRadius: 10, padding: '14px 16px', marginBottom: 12, background: '#fff5f3', color: '#7f2925' }}>
      <div style={{ fontWeight: 800, fontSize: 16 }}>⚠ تنبيه من إدارة المدرسة</div>
      <p style={{ margin: '8px 0 12px', fontSize: 14 }}>لديك {urgentCount} {urgentCount === 1 ? 'ملاحظة إدارية تتطلب إجراءً' : 'ملاحظات إدارية تتطلب إجراءً'}{unread > 0 ? `، منها ${unread} لم يُطّلع عليها بعد` : ''}.</p>
      <button type="button" onClick={() => { setFilter('pending'); setOpen(true); }} style={{ ...button, background: '#a8322e', borderColor: '#a8322e' }}>عرض الملاحظات والتفاصيل</button>
    </div>}
    {!isAdmin && !loading && !error && urgentCount === 0 && infoUnread > 0 && <div role="status" style={{ border: '1px solid #e3c28c', borderRight: '5px solid #b78328', borderRadius: 10, padding: 14, marginBottom: 12, background: '#fff9ed', color: '#76501b' }}>
      <strong>🔔 ملاحظة إدارية للاطلاع</strong>
      <p style={{ margin: '7px 0 10px', fontSize: 13 }}>لديك {infoUnread} {infoUnread === 1 ? 'ملاحظة جديدة' : 'ملاحظات جديدة'} من إدارة المدرسة.</p>
      <button type="button" onClick={() => { setFilter('all'); setOpen(true); }} style={{ ...button, background: '#94641e', borderColor: '#94641e' }}>عرض الملاحظات</button>
    </div>}
    <button type="button" style={{ ...button, width: '100%', textAlign: 'right', background: !isAdmin && urgentCount > 0 ? '#a8322e' : !isAdmin && infoUnread > 0 ? '#94641e' : colors.primary }}  aria-expanded={open} onClick={() => setOpen(!open)}>
      ملاحظات الإدارة {loading ? '…' : `(${unread} غير مقروءة · ${pendingCount} بانتظار المتابعة)`}{error ? ' — تعذّر التحديث' : ''}
    </button>
    {open && <div style={{ marginTop: 12 }}>
      {error && <p role="alert" style={{ color: colors.red }}>{error}</p>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {filterBtn('pending', `بانتظار المتابعة (${pendingCount})`)}{filterBtn('all', `جميع الملاحظات (${notes.length})`)}{filterBtn('done', `المكتملة (${completedCount})`)}
      </div>
      {loading ? <p>جارٍ تحميل الملاحظات…</p> : !error && shown.length === 0
        ? <p>{filter === 'pending' ? 'لا توجد ملاحظات بانتظار المتابعة.' : 'لا توجد ملاحظات في هذه القائمة.'}</p>
        : shown.map(n => <NoteCard key={n.id} note={n} schoolId={schoolId} isAdmin={false} />)}
    </div>}
  </section>;
}
