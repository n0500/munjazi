import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { watchNotes, createNote, respondToNote, serverTimestamp } from '../lib/adminNotesApi.js';
import { noteWhatsAppUrl } from '../lib/noteWhatsApp.js';
import { cachedContactNumbers, watchContactNumbers, saveContactNumber } from '../lib/adminContactsApi.js';
import { colors, radius } from '../lib/theme.js';
import { needsFollowUp, isFinished } from '../lib/noteStatus.js';
import { loadAutoNoteStatuses, readAutoContext, visibleNoteContext, AUTO_ACTIONS, encodeAutoContext } from '../lib/autoNoteTracking.js';
import { listWeeksForClass } from '../lib/weeksApi.js';

const box = { padding: 16, border: `1px solid ${colors.border}`, borderRadius: radius.card, marginBottom: 12 };
const field = { display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, margin: '6px 0 12px', font: 'inherit' };
const button = { padding: '9px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.primary, color: '#fff', cursor: 'pointer' };
const secondary = { ...button, background: '#f5f5f5', color: colors.ink };
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
  const attention = !isAdmin && needsFollowUp(note);
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

export default function AdminNotes({ schoolId, teachers = [], assignments = [], classes = [], isAdmin = false, onOpenReport }) {
  const { profile } = useAuth();
  const [notes, setNotes] = useState([]);
  const [autoStatuses, setAutoStatuses] = useState({});
  const [autoChecking, setAutoChecking] = useState(false);
  const [autoError, setAutoError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [reportTeacher, setReportTeacher] = useState('');
  const [reportState, setReportState] = useState('all');
  const [autoType, setAutoType] = useState('');
  const [sourceWeekId, setSourceWeekId] = useState('');
  const [sourceWeeks, setSourceWeeks] = useState([]);
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
    const refresh = () => setRefreshTick(t => t + 1);
    const visibility = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visibility);
    const timer = setInterval(refresh, 120000);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visibility); clearInterval(timer); };
  }, []);
  useEffect(() => {
    let active = true;
    if (!notes.some(n => n.kind === 'action' && readAutoContext(n.context))) {
      setAutoStatuses({}); setAutoChecking(false); setAutoError('');
      return () => { active = false; };
    }
    setAutoChecking(true); setAutoError('');
    loadAutoNoteStatuses(schoolId, notes).then(results => {
      if (active) setAutoStatuses(results);
    }).catch(err => { if (active) setAutoError(err.message || 'تعذّر تحديث حالات المتابعة الآلية.'); })
      .finally(() => { if (active) setAutoChecking(false); });
    return () => { active = false; };
  }, [schoolId, notes, refreshTick]);
  useEffect(() => {
    let active = true;
    setSourceWeeks([]); setSourceWeekId('');
    if (!isAdmin || !assignmentId) return () => { active = false; };
    const assignment = assignments.find(a => a.id === assignmentId && a.teacherUid === teacherUid);
    if (!assignment) return () => { active = false; };
    listWeeksForClass(schoolId, assignment.classId, teacherUid, assignment.id)
      .then(weeks => { if (active) setSourceWeeks(weeks.filter(w => w.type === 'measurement')); })
      .catch(() => { if (active) setSourceWeeks([]); });
    return () => { active = false; };
  }, [schoolId, isAdmin, assignmentId, teacherUid]);
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
      if (autoType && (!assignment || !sourceWeekId)) throw new Error('اختاري الفصل وأسبوع القياس قبل تفعيل المتابعة الآلية.');
      const baseContext = [assignment ? `${classes.find(c => c.id === assignment.classId)?.name || ''} — ${assignment.subject || ''}` : '', autoType ? sourceWeeks.find(w => w.id === sourceWeekId)?.name || '' : week.trim()]
        .filter(Boolean).join(' · ');
      const context = autoType && kind === 'action' ? encodeAutoContext(baseContext, autoType, sourceWeekId) : baseContext.slice(0, 600);
      await createNote(schoolId, profile, {
        teacherUid, teacherName: teacher.displayName || 'المعلمة',
        assignmentId: assignment?.id || '', context, kind, text: noteText.trim(),
      });
      setNoteText(''); setFilter('pending'); setAutoType(''); setSourceWeekId('');
      setSuccess('تم حفظ الملاحظة. ستظهر للمعلمة، ويمكنك تجهيز رسالة واتساب من البطاقة أدناه.');
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  const enriched = notes.map(n => ({ ...n, autoResult: autoStatuses[n.id], autoState: autoStatuses[n.id]?.state }));
  const unread = enriched.filter(n => !n.readAt).length;
  const urgentCount = enriched.filter(n => n.kind === 'action' && needsFollowUp(n)).length;
  const infoUnread = enriched.filter(n => n.kind === 'info' && !n.readAt).length;
  const pendingCount = enriched.filter(needsFollowUp).length;
  const completedCount = enriched.filter(isFinished).length;
  const shown = enriched.filter(n => filter === 'all' || (filter === 'pending' ? needsFollowUp(n) : isFinished(n)));

  const reportRows = enriched.filter(n => (!reportTeacher || n.teacherUid === reportTeacher) && (reportState === 'all' || (reportState === 'pending' ? needsFollowUp(n) : reportState === 'complete' ? isFinished(n) : n.autoState === 'progress')));
  function printReport() {
    const popup = window.open('', '_blank');
    if (!popup) return;
    const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const rows = reportRows.map(n => '<tr><td>'+escape(n.teacherName)+'</td><td>'+escape(visibleNoteContext(n.context))+'</td><td>'+escape(n.kind === 'info' ? 'للاطلاع' : n.autoState === 'complete' ? 'تم التنفيذ وفق بيانات منجزي' : n.autoState === 'progress' ? 'جارٍ التنفيذ' : n.autoState === 'unverified' ? 'تعذّر التحقق' : n.kind === 'action' && !readAutoContext(n.context) && n.completedAt ? 'أفادت المعلمة بإتمام الإجراء' : 'بانتظار المتابعة')+'</td><td>'+escape(n.autoResult?.evidence?.weekName || '—')+'</td><td>'+escape(n.reply || '—')+'</td></tr>').join('');
    popup.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير متابعة الملاحظات الإدارية</title><style>body{font-family:Tahoma,Arial,sans-serif;color:#23352b;padding:22px}h1{text-align:center;font-size:21px}p{text-align:center}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ccd7d0;padding:8px;vertical-align:top}th{background:#e8f1eb}@page{size:A4 landscape;margin:12mm}@media print{button{display:none}}</style></head><body><h1>تقرير متابعة الملاحظات الإدارية — منجزي</h1><p>تقرير آلي بحسب بيانات الرصد المسجلة وقت الإصدار · مجموع الملاحظات: '+reportRows.length+'</p><table><thead><tr><th>المعلمة</th><th>سياق التقرير</th><th>حالة المتابعة</th><th>الشاهد</th><th>رد المعلمة</th></tr></thead><tbody>'+rows+'</tbody></table><p>تعني حالة «تم التنفيذ وفق بيانات منجزي» تحقق شروط الرصد الآلي، ولا تعني مراجعة إدارية مستقلة.</p><button onclick="window.print()">طباعة / حفظ PDF</button></body></html>');
    popup.document.close();
  }
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
    {isAdmin && <section style={{ ...box, background: '#f7faf8', marginTop: 12 }}>
      <h3 style={{ margin: '0 0 8px' }}>تقرير متابعة الملاحظات الإدارية</h3>
      <p style={{ fontSize: 12, marginTop: 0, color: colors.textMuted }}>الحالات الآلية محسوبة من نتائج الرصد والربط الموثق، ولا تتطلب تأكيدًا من المعلمة.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, fontSize: 13 }}>
        <span>الإجمالي: <b>{enriched.length}</b></span><span>بانتظار المتابعة: <b>{pendingCount}</b></span><span>تمت: <b>{completedCount}</b></span><span>تنفيذ آلي مكتمل: <b>{enriched.filter(n => n.autoState === 'complete').length}</b></span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ flex: '1 1 160px' }}>المعلمة
          <select style={field} value={reportTeacher} onChange={e => setReportTeacher(e.target.value)}>
            <option value="">جميع المعلمات</option>{teachers.map(t => <option key={t.uid} value={t.uid}>{t.displayName}</option>)}
          </select>
        </label>
        <label style={{ flex: '1 1 160px' }}>الحالة
          <select style={field} value={reportState} onChange={e => setReportState(e.target.value)}>
            <option value="all">جميع الحالات</option><option value="pending">بانتظار المتابعة</option><option value="progress">جارٍ التنفيذ</option><option value="complete">المكتملة</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={secondary} disabled={autoChecking} onClick={() => setRefreshTick(t => t + 1)}>{autoChecking ? 'جارٍ التحقق…' : 'تحديث الحالات من الرصد'}</button>
        <button type="button" style={button} onClick={printReport}>طباعة التقرير / حفظ PDF</button>
      </div>
      {autoError && <p role="alert" style={{ color: colors.red }}>{autoError}</p>}
      <div style={{ marginTop: 12, display: 'grid', gap: 7 }}>
        {reportRows.map(n => <div key={n.id} style={{ background: '#fff', border: '1px solid #dce5de', borderRadius: 8, padding: 9 }}>
          <strong>{n.teacherName}</strong> <small>— {visibleNoteContext(n.context)}</small>
          <div style={{ marginTop: 4, fontSize: 12, color: n.autoState === 'complete' ? '#0b6b3b' : colors.ink }}>
            {n.autoState === 'complete' ? 'تم التنفيذ وفق بيانات منجزي' : n.autoState === 'progress' ? 'جارٍ التنفيذ' : n.autoState === 'unverified' ? 'تعذّر التحقق الآلي' : isFinished(n) ? 'مكتملة بإفادة المعلمة' : 'بانتظار المتابعة'}
            {n.autoResult?.evidence ? ' · الشاهد: ' + n.autoResult.evidence.weekName : ''}
          </div>
          {n.autoResult?.evidence && onOpenReport && <button type="button" style={{ ...secondary, padding: '5px 9px', marginTop: 6 }} onClick={() => onOpenReport({ ...n.autoResult.evidence, assignmentId: n.assignmentId, teacherName: n.teacherName, className: visibleNoteContext(n.context).split(' · ')[0], direct: true })}>فتح تقرير الشاهد</button>}
        </div>)}
      </div>
    </section>}
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
          {kind === 'action' && <label>طريقة متابعة التنفيذ
            <select style={field} value={autoType} onChange={e => { setAutoType(e.target.value); setSourceWeekId(''); }}>
              <option value="">متابعة يدوية (ملاحظة عامة)</option>
              <option value="completion">تلقائي — استكمال الرصد</option>
              <option value="remediation">تلقائي — تنفيذ المعالجة</option>
              <option value="reassessment">تلقائي — إعادة القياس</option>
            </select>
          </label>}
          {kind === 'action' && autoType ? <label>أسبوع القياس المرتبط
            <select required style={field} value={sourceWeekId} onChange={e => setSourceWeekId(e.target.value)}>
              <option value="">اختاري التقرير الأصلي</option>
              {sourceWeeks.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <small>يُتحقق من النتائج المسجلة بعد إرسال الملاحظة، دون اعتماد يدوي.</small>
          </label> : formWeek}
          <label>نوع الملاحظة<select style={field} value={kind} onChange={e => setKind(e.target.value)}>
            <option value="info">للاطلاع</option><option value="action">يتطلب إجراء</option>
          </select></label>
          <label>الملاحظة<textarea style={field} required rows={4} maxLength={2000} value={noteText} onChange={e => setNoteText(e.target.value)} /></label>
          <button type="submit" style={button} disabled={busy || !noteText.trim() || !teacherUid || (kind === 'action' && !!autoType && !sourceWeekId)}>
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
            savedPhone={contacts[n.teacherUid] || ''} onSavePhone={saveContact} contactMode={contactMode} onOpenReport={onOpenReport} />)}
    </div>}
  </section>;
}
