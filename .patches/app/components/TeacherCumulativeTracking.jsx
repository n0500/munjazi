import { useEffect, useRef, useState } from 'react';
import { listWeeksForClass } from '../lib/weeksApi.js';
import { listSkillsForWeek } from '../lib/skillsApi.js';
import { listAssessmentsForSkill } from '../lib/assessmentsApi.js';
import { listClassStudents } from '../lib/studentsApi.js';
import { colors } from '../lib/theme.js';
import { useAuth } from '../context/AuthContext.js';
import { createNote, watchNotes } from '../lib/adminNotesApi.js';
import { encodeAutoContext, visibleNoteContext, readAutoContext } from '../lib/autoNoteTracking.js';

const normalize = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const stamp = (w) => w.createdAt?.seconds || 0;
const buttonStyle = { border: '1px solid #b9cec3', borderRadius: 7, padding: '6px 12px', color: colors.primary, background: '#fff', cursor: 'pointer' };

async function loadTeacherHistory(schoolId, assignments) {
  const histories = await Promise.all(assignments.map(async (a) => {
    const [weeks, students] = await Promise.all([
      listWeeksForClass(schoolId, a.classId, a.teacherUid, a.id),
      listClassStudents(schoolId, a.classId),
    ]);
    const entries = await Promise.all(weeks.map(async (week) => {
      const skills = await listSkillsForWeek(schoolId, week.id);
      const assessments = await Promise.all(skills.map((skill) => listAssessmentsForSkill(schoolId, skill.id)));
      const recorded = assessments.reduce((n, map) => n + students.filter((student) => Boolean(map[student.id]?.status)).length, 0);
      const total = students.length * skills.length;
      const mastered = assessments.reduce((n, map) => n + students.filter((student) => map[student.id]?.status === 'mastered').length, 0);
      return { week, skills, recorded, completion: total ? Math.round(recorded * 100 / total) : null,
        mastery: recorded ? Math.round(mastered * 100 / recorded) : null, assignment: a };
    }));
    return entries.filter((e) => e.recorded > 0);
  }));
  return histories.flat();
}

function buildRows(entries) {
  const measurements = entries.filter((e) => e.week.type !== 'remediation');
  const remediations = entries.filter((e) => e.week.type === 'remediation');
  const used = new Set();
  const rows = measurements.map((measurement) => {
    const sourceTitles = new Set(measurement.skills.map((s) => normalize(s.title)));
    const linked = remediations.filter((r) => {
      if (r.assignment.classId !== measurement.assignment.classId || r.assignment.teacherUid !== measurement.assignment.teacherUid) return false;
      if (r.week.sourceMeasurementWeekId) return r.week.sourceMeasurementWeekId === measurement.week.id;
      if (stamp(r.week) < stamp(measurement.week)) return false;
      return r.skills.some((skill) => normalize(skill.sourceWeekName) === normalize(measurement.week.name) &&
        (skill.sourceWeekType === 'measurement' || !skill.sourceWeekType) && sourceTitles.has(normalize(skill.title)));
    });
    linked.forEach((r) => used.add(r.week.id));
    return { measurement, linked };
  });
  remediations.filter((r) => !used.has(r.week.id)).forEach((r) => rows.push({ measurement: null, linked: [r] }));
  return rows.sort((a, b) => stamp(b.measurement?.week || b.linked[0]?.week) - stamp(a.measurement?.week || a.linked[0]?.week));
}

export default function TeacherCumulativeTracking({ schoolId, assignments, teachers, onReport }) {
  const { profile } = useAuth();
  const [noteEntry, setNoteEntry] = useState(null);
  const noteDialogRef = useRef(null);
  const [expanded, setExpanded] = useState({});
  const [noteText, setNoteText] = useState('');
  const [noteKind, setNoteKind] = useState('action');
  const [autoType, setAutoType] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [noteSuccess, setNoteSuccess] = useState('');
  const [priorNotes, setPriorNotes] = useState([]);
  const [teacherUid, setTeacherUid] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setEntries([]); setExpanded({}); setNoteEntry(null); }, [teacherUid, schoolId]);
  useEffect(() => { if (noteEntry) noteDialogRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }, [noteEntry]);
  useEffect(() => {
    if (!noteEntry) return;
    return watchNotes(schoolId, noteEntry.assignment.teacherUid, setPriorNotes, err => setNoteError(err.message || 'تعذّر تحميل الملاحظات.'));
  }, [schoolId, noteEntry]);
  const teacherAssignments = assignments.filter((a) => a.teacherUid === teacherUid && a.active !== false);
  async function load() {
    if (!teacherUid) return;
    setLoading(true); setError('');
    try { setEntries(await loadTeacherHistory(schoolId, teacherAssignments)); }
    catch (err) { setError(err.message || 'تعذّر تحميل سجل القياسات.'); }
    finally { setLoading(false); }
  }
  const rows = buildRows(entries).filter(row => classFilter === 'all' || (row.measurement || row.linked[0])?.assignment.classId === classFilter);
  const open = (e) => onReport({
    classId: e.assignment.classId, teacherUid: e.assignment.teacherUid, assignmentId: e.assignment.id,
    className: e.assignment.className || '', teacherName: e.assignment.teacherName || '',
    subject: e.assignment.subject || '', weekId: e.week.id, weekName: e.week.name, weekType: e.week.type,
  });
  const noteTarget = (e) => {
    setNoteEntry(e); setNoteText(''); setNoteKind('action'); setAutoType(e.week.type === 'measurement' ? 'remediation' : 'completion'); setNoteError(''); setNoteSuccess(''); setPriorNotes([]);
  };
  async function saveNote(event) {
    event.preventDefault();
    if (!noteEntry || !noteText.trim() || noteBusy) return;
    setNoteBusy(true); setNoteError(''); setNoteSuccess('');
    try {
      const teacher = teachers.find(t => t.uid === noteEntry.assignment.teacherUid);
      if (!teacher || teacher.disabled) throw new Error('تعذّر تحديد المعلمة المسؤولة عن التقرير.');
      const baseContext = [noteEntry.assignment.className || '', noteEntry.assignment.subject || '', noteEntry.week.name].filter(Boolean).join(' · ');
      const context = noteKind === 'action' && autoType ? encodeAutoContext(baseContext, autoType, noteEntry.week.id) : baseContext.slice(0, 600);
      await createNote(schoolId, profile, {
        teacherUid: teacher.uid, teacherName: teacher.displayName || 'المعلمة',
        assignmentId: noteEntry.assignment.id || '', context, kind: noteKind, text: noteText.trim(),
      });
      setNoteText(''); setNoteSuccess('تم حفظ الملاحظة وإرسالها للمعلمة.');
    } catch (err) { setNoteError(err?.message || 'تعذّر حفظ الملاحظة.'); }
    finally { setNoteBusy(false); }
  }
  const weekLink = (entry, type) => <button type="button"
    onClick={() => open(entry)}
    title={'فتح تقرير ' + entry.week.name}
    style={{ background: 'none', border: 'none', padding: '4px 0', fontSize: 14, lineHeight: 1.5,
      fontWeight: 750, textAlign: 'right', textDecoration: 'underline', textUnderlineOffset: 3,
      color: type === 'measurement' ? '#165b85' : '#955319', cursor: 'pointer', overflowWrap: 'anywhere' }}>
    {entry.week.name}
  </button>;
  const noteButton = (entry) => <button type="button" onClick={() => noteTarget(entry)}
    style={{ ...buttonStyle, fontSize: 12, padding: '7px 9px', color: '#245840' }}>
    ✎ ملاحظة إدارية
  </button>;
  const grouped = Array.from(new Map(rows.map(row => {
    const ref = row.measurement || row.linked[0];
    const a = ref.assignment;
    return [a.id || a.classId + ':' + a.subject, a];
  })).entries());
  const metricPanel = (entry, type) => {
    const measurement = type === 'measurement';
    const fg = measurement ? '#165b85' : '#955319';
    const accent = measurement ? '#d7e8f4' : '#f5dfc9';
    const surface = measurement ? '#f5faff' : '#fff9f3';
    return <div style={{ minWidth: 0, padding: '11px 10px', border: '1px solid ' + accent,
      background: surface, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ color: fg, fontSize: 12, fontWeight: 750, display: 'flex', gap: 6, alignItems: 'center' }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, background: fg, flexShrink: 0 }} />
        {measurement ? 'القياس' : 'المعالجة والمتابعة'}
      </div>
      {entry ? <>
        {weekLink(entry, type)}
        <div style={{ borderRadius: 8, background: measurement ? '#eaf3fb' : '#fff0e1', padding: '8px 9px' }}>
          <div style={{ fontSize: 11, color: fg }}>{measurement ? 'نسبة الإتقان' : 'الإتقان بعد المعالجة'}</div>
          <strong style={{ display: 'block', marginTop: 1, fontSize: 23, lineHeight: 1.3, color: '#18392b' }}>
            {entry.mastery == null ? '—' : entry.mastery + '%'}
          </strong>
        </div>
        <div style={{ fontSize: 11, color: '#547063', lineHeight: 1.45 }}>
          اكتمال {measurement ? 'الرصد' : 'المعالجة'}: <strong style={{ color: '#284a38' }}>{entry.completion == null ? '—' : entry.completion + '%'}</strong>
        </div>
      </> : <div style={{ flex: 1, minHeight: 78, display: 'flex', alignItems: 'center',
        fontSize: 12, color: '#73867b' }}>
        {measurement ? 'لا يوجد قياس مرتبط' : 'لا توجد معالجة مرتبطة'}
      </div>}
    </div>;
  };
  return <section dir="rtl" style={{ border: '1px solid #dce5de', borderRadius: 14,
      padding: '14px clamp(10px, 2.5vw, 18px)', marginBottom: 20, fontFamily: 'inherit' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
      <div>
        <h3 style={{ margin: '0 0 3px', color: '#1b3e2b', fontSize: 19 }}>متابعة القياس والمعالجة</h3>
        <p style={{ margin: 0, color: colors.textMuted, fontSize: 12 }}>
          مقارنة مرتبة حسب المعلمة والفصل، مع الوصول للتقارير والملاحظات عند الطلب.
        </p>
      </div>
      <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center',
        width: 34, height: 34, background: '#eaf2ed', borderRadius: 10, fontSize: 17, flexShrink: 0 }}>▥</span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 9, alignItems: 'end', marginBottom: 11 }}>
      <label style={{ fontSize: 12, color: '#536c5d', minWidth: 0 }}>
        المعلمة
        <select value={teacherUid} onChange={e => { setTeacherUid(e.target.value); setClassFilter('all'); }}
          style={{ display: 'block', width: '100%', boxSizing: 'border-box', minWidth: 0,
            marginTop: 4, borderRadius: 8, padding: '9px 6px', border: '1px solid #d4e1d8', font: 'inherit',
            fontSize: 13, background: '#fff', color: '#203c2c' }}>
          <option value="">اختاري المعلمة</option>
          {teachers.map(t => <option key={t.uid} value={t.uid}>{t.displayName}</option>)}
        </select>
      </label>
      <label style={{ fontSize: 12, color: '#536c5d', minWidth: 0 }}>
        الفصل
        <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
          style={{ display: 'block', width: '100%', boxSizing: 'border-box', minWidth: 0,
            marginTop: 4, borderRadius: 8, padding: '9px 6px', border: '1px solid #d4e1d8',
            font: 'inherit', fontSize: 13, background: '#fff', color: '#203c2c' }}>
          <option value="all">جميع الفصول</option>
          {Array.from(new Map(teacherAssignments.map(a => [a.classId, a])).values())
            .map(a => <option key={a.classId} value={a.classId}>{a.className || a.classId}</option>)}
        </select>
      </label>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
      alignItems: 'center', marginBottom: 13 }}>
      <span style={{ color: colors.textMuted, fontSize: 11 }}>
        {teacherUid && entries.length ? `${grouped.length} فصول · ${rows.length} سجلات قياس/متابعة` : 'اختاري المعلمة لعرض سجلها'}
      </span>
      <button type="button" disabled={!teacherUid || loading} onClick={load}
        style={{ ...buttonStyle, fontSize: 12, fontWeight: 700, minHeight: 34,
          opacity: !teacherUid || loading ? 0.55 : 1 }}>
        {loading ? 'جارٍ تحميل النتائج…' : entries.length ? '↻ تحديث النتائج' : 'عرض النتائج'}
      </button>
    </div>
    {error && <p role="alert" style={{ color: '#a22' }}>{error}</p>}
    {loading && <p role="status" style={{ fontSize: 13, color: colors.textMuted }}>جارٍ تحميل أسابيع القياس والمعالجة…</p>}
    {!loading && teacherUid && !entries.length && <p style={{ color: colors.textMuted, fontSize: 13 }}>
      لا توجد نتائج محمّلة لهذه المعلمة. اضغطي «عرض النتائج» للتحقق من السجل.
    </p>}
    {noteEntry && <div ref={noteDialogRef} role="dialog" aria-label="ملاحظة المديرة على التقرير" style={{ border: '1px solid #a8c5b6', borderRadius: 12, padding: 14, marginBottom: 16, background: '#fafdfb' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <strong>ملاحظة المديرة — {noteEntry.assignment.className || ''} · {noteEntry.week.name}</strong>
        <button type="button" style={buttonStyle} onClick={() => setNoteEntry(null)}>إغلاق</button>
      </div>
      <form onSubmit={saveNote} style={{ marginTop: 12 }}>
        <label style={{ display: 'block', marginBottom: 9 }}>نوع الملاحظة
          <select value={noteKind} onChange={e => setNoteKind(e.target.value)} style={{ display: 'block', width: '100%', padding: 9, marginTop: 4 }}>
            <option value="action">يتطلب متابعة</option><option value="info">للاطلاع فقط</option>
          </select>
        </label>
        {noteKind === 'action' && <label style={{ display: 'block', marginBottom: 9 }}>متابعة التنفيذ
          <select value={autoType} onChange={e => setAutoType(e.target.value)} style={{ display: 'block', width: '100%', padding: 9, marginTop: 4 }}>
            <option value="">تأكيد يدوي (ملاحظة عامة)</option>
            <option value="completion">تلقائي — استكمال الرصد</option>
            {noteEntry.week.type === 'measurement' && <option value="remediation">تلقائي — تنفيذ المعالجة</option>}
            {noteEntry.week.type === 'measurement' && <option value="reassessment">تلقائي — إعادة القياس</option>}
          </select>
        </label>}
                <label style={{ display: 'block' }}>ملاحظة الإدارة
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3} maxLength={2000} required style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, marginTop: 5, font: 'inherit' }} />
        </label>
        <button type="submit" disabled={noteBusy || !noteText.trim()} style={{ ...buttonStyle, background: colors.primary, color: '#fff', marginTop: 10 }}>{noteBusy ? 'جارٍ الحفظ…' : 'حفظ الملاحظة وإشعار المعلمة'}</button>
      </form>
      {noteSuccess && <p role="status" style={{ color: '#0b5c33' }}>{noteSuccess}</p>}
      {noteError && <p role="alert" style={{ color: '#a22' }}>{noteError}</p>}
      {priorNotes.filter(n => n.reportWeekId === noteEntry.week.id || (!n.reportWeekId && n.assignmentId === noteEntry.assignment.id && (readAutoContext(n.context)?.sourceWeekId === noteEntry.week.id || visibleNoteContext(n.context).split(' · ').at(-1) === noteEntry.week.name))).length > 0 && <div style={{ marginTop: 12, borderTop: '1px solid #dce5de', paddingTop: 10 }}>
        <strong style={{ fontSize: 13 }}>الملاحظات السابقة وردود المعلمة</strong>
        {priorNotes.filter(n => n.reportWeekId === noteEntry.week.id || (!n.reportWeekId && n.assignmentId === noteEntry.assignment.id && (readAutoContext(n.context)?.sourceWeekId === noteEntry.week.id || visibleNoteContext(n.context).split(' · ').at(-1) === noteEntry.week.name))).map(n => <div key={n.id} style={{ padding: 9, border: '1px solid #e2eae5', borderRadius: 7, marginTop: 7, fontSize: 13 }}>
          <div>{n.text}</div>
          {n.reply && <div style={{ marginTop: 5, color: colors.primary }}>رد المعلمة: {n.reply}</div>}
          <small style={{ color: colors.textMuted }}>{n.completedAt ? 'تمت المتابعة' : n.kind === 'action' ? 'بانتظار المتابعة' : 'للاطلاع'}</small>
        </div>)}
      </div>}
    </div>}

    <div style={{ display: 'grid', gap: 13 }}>
      {grouped.map(([assignmentKey, assignment]) => {
        const classRows = rows.filter(row => {
          const a = (row.measurement || row.linked[0]).assignment;
          return (a.id || a.classId + ':' + a.subject) === assignmentKey;
        });
        const totalMeasurements = classRows.filter(row => !!row.measurement).length;
        const totalRemediations = classRows.reduce((sum, row) => sum + row.linked.length, 0);
        return <section key={assignmentKey} style={{ border: '1px solid #d8e5dc',
          borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          <header style={{ background: '#e9f3ed', borderBottom: '1px solid #d8e5dc',
            padding: '10px 12px', color: '#1c4e35' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4, alignItems: 'baseline' }}>
              <strong style={{ fontSize: 15 }}>{assignment.className || assignment.classId}</strong>
              <span style={{ fontSize: 11, color: '#597d67' }}>
                {totalMeasurements} قياس · {totalRemediations} معالجة
              </span>
            </div>
            <div style={{ marginTop: 2, color: '#597d67', fontSize: 12 }}>{assignment.subject || 'المادة'}</div>
          </header>
          <div style={{ padding: 9, display: 'grid', gap: 9 }}>
            {classRows.flatMap(row => {
              const treatments = row.linked.length ? row.linked : [null];
              return treatments.map(treatment => {
                const measurement = row.measurement;
                const id = (measurement?.week.id || 'unlinked') + ':' + (treatment?.week.id || 'none');
                const isOpen = !!expanded[id];
                const diff = measurement?.mastery != null && treatment?.mastery != null
                  ? treatment.mastery - measurement.mastery : null;
                const diffText = diff == null ? '' : diff > 0
                  ? 'فرق مؤشر الإتقان: +' + diff + ' نقطة مئوية'
                  : diff < 0 ? 'فرق مؤشر الإتقان: ' + diff + ' نقاط مئوية'
                  : 'مؤشر الإتقان دون تغير';
                const diffColor = diff == null ? '#64796b' : diff > 0 ? '#157347' : diff < 0 ? '#ae4037' : '#64796b';
                return <article key={id} style={{ border: '1px solid #e5ece7', borderRadius: 10, padding: 9 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7 }}>
                    {metricPanel(measurement, 'measurement')}
                    {metricPanel(treatment, 'remediation')}
                  </div>
                  <div style={{ marginTop: 9, display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: diff != null ? 700 : 400, color: diffColor }}>
                      {diff != null ? diffText : treatment && !measurement ? 'معالجة دون قياس مرتبط' : measurement && !treatment ? 'لم تسجّل معالجة مرتبطة' : ''}
                    </span>
                    <button type="button" aria-expanded={isOpen} onClick={() => setExpanded(current => ({ ...current, [id]: !current[id] }))}
                      style={{ ...buttonStyle, padding: '6px 9px', fontSize: 11, color: '#356b50' }}>
                      {isOpen ? 'إخفاء التفاصيل −' : 'التفاصيل والملاحظات +'}
                    </button>
                  </div>
                  {isOpen && <div style={{ marginTop: 10, borderTop: '1px solid #e4ebe5', paddingTop: 10 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {measurement && <button type="button" onClick={() => open(measurement)} style={{ ...buttonStyle, fontSize: 12 }}>
                        تقرير القياس
                      </button>}
                      {treatment && <button type="button" onClick={() => open(treatment)} style={{ ...buttonStyle, fontSize: 12 }}>
                        تقرير المعالجة
                      </button>}
                      {measurement && noteButton(measurement)}
                      {treatment && noteButton(treatment)}
                    </div>
                    {diff != null && <p style={{ fontSize: 11, margin: '9px 0 0', color: '#728579' }}>
                      الفرق بين نسب الإتقان في التقريرين، وقد تختلف المهارات أو الطالبات المقاسات.
                    </p>}
                  </div>}
                </article>;
              });
            })}
          </div>
        </section>;
      })}
    </div>
  </section>;
}
