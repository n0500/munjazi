import { useEffect, useState } from 'react';
import { listWeeksForClass } from '../lib/weeksApi.js';
import { listSkillsForWeek } from '../lib/skillsApi.js';
import { listAssessmentsForSkill } from '../lib/assessmentsApi.js';
import { listClassStudents } from '../lib/studentsApi.js';
import { colors } from '../lib/theme.js';
import { useAuth } from '../context/AuthContext.js';
import { createNote, watchNotes } from '../lib/adminNotesApi.js';

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
  const [noteText, setNoteText] = useState('');
  const [noteKind, setNoteKind] = useState('action');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [noteSuccess, setNoteSuccess] = useState('');
  const [priorNotes, setPriorNotes] = useState([]);
  const [teacherUid, setTeacherUid] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setEntries([]); }, [teacherUid, schoolId]);
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
    setNoteEntry(e); setNoteText(''); setNoteKind('action'); setNoteError(''); setNoteSuccess(''); setPriorNotes([]);
  };
  async function saveNote(event) {
    event.preventDefault();
    if (!noteEntry || !noteText.trim() || noteBusy) return;
    setNoteBusy(true); setNoteError(''); setNoteSuccess('');
    try {
      const teacher = teachers.find(t => t.uid === noteEntry.assignment.teacherUid);
      if (!teacher || teacher.disabled) throw new Error('تعذّر تحديد المعلمة المسؤولة عن التقرير.');
      const context = [noteEntry.assignment.className || '', noteEntry.assignment.subject || '', noteEntry.week.name].filter(Boolean).join(' · ').slice(0, 600);
      await createNote(schoolId, profile, {
        teacherUid: teacher.uid, teacherName: teacher.displayName || 'المعلمة',
        assignmentId: noteEntry.assignment.id || '', context, kind: noteKind, text: noteText.trim(),
      });
      setNoteText(''); setNoteSuccess('تم حفظ الملاحظة وإرسالها للمعلمة.');
    } catch (err) { setNoteError(err?.message || 'تعذّر حفظ الملاحظة.'); }
    finally { setNoteBusy(false); }
  }
  const weekControl = (e) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
    <button type="button" style={{ ...buttonStyle, border: 'none', textDecoration: 'underline', fontWeight: 700, color: e.week.type === 'remediation' ? '#98521b' : '#17618b', background: 'transparent', padding: '5px 2px' }} onClick={() => open(e)} aria-label={'فتح تقرير ' + e.week.name}>{e.week.name}</button>
    <button type="button" title="ملاحظة المديرة على هذا التقرير" aria-label={'ملاحظة على ' + e.week.name} onClick={() => noteTarget(e)} style={{ ...buttonStyle, padding: '5px 8px' }}>✎</button>
  </span>;
  return <section dir="rtl" style={{ border: '1px solid #dce5de', borderRadius: 12, padding: 16, marginBottom: 20 }}>
    <h3 style={{ marginTop: 0 }}>تجربة متابعة المعلمة — القياس والمعالجة</h3>
    <p style={{ fontSize: 13, color: colors.textMuted }}>نموذج مستقل للاختبار. القياس على اليمين والمعالجة المقابلة له على اليسار. اضغطي اسم الأسبوع لفتح التقرير، أو رمز القلم للوصول إلى ملاحظته.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end', marginBottom: 14 }}>
      <label>المعلمة <select value={teacherUid} onChange={(e) => {setTeacherUid(e.target.value);setClassFilter('all');}} style={{ display: 'block', padding: 9, minWidth: 160 }}>
        <option value="">اختاري المعلمة</option>{teachers.map(t => <option key={t.uid} value={t.uid}>{t.displayName}</option>)}
      </select></label>
      <label>الفصل <select value={classFilter} onChange={e => setClassFilter(e.target.value)} style={{ display: 'block', padding: 9, minWidth: 130 }}>
        <option value="all">جميع الفصول</option>{teacherAssignments.map(a => <option key={a.id} value={a.classId}>{a.className || a.classId}</option>)}
      </select></label>
      <button type="button" onClick={load} disabled={!teacherUid || loading} style={buttonStyle}>{loading ? 'جارٍ التحميل...' : 'عرض / تحديث'}</button>
    </div>
    {error && <p role="alert" style={{ color: '#a22' }}>{error}</p>}
    {!loading && teacherUid && !entries.length && <p style={{ color: colors.textMuted }}>لا توجد تقارير محمّلة لهذه المعلمة.</p>}
    {noteEntry && <div role="dialog" aria-label="ملاحظة المديرة على التقرير" style={{ border: '1px solid #a8c5b6', borderRadius: 12, padding: 14, marginBottom: 16, background: '#fafdfb' }}>
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
        <label style={{ display: 'block' }}>ملاحظة الإدارة
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3} maxLength={2000} required style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, marginTop: 5, font: 'inherit' }} />
        </label>
        <button type="submit" disabled={noteBusy || !noteText.trim()} style={{ ...buttonStyle, background: colors.primary, color: '#fff', marginTop: 10 }}>{noteBusy ? 'جارٍ الحفظ…' : 'حفظ الملاحظة وإشعار المعلمة'}</button>
      </form>
      {noteSuccess && <p role="status" style={{ color: '#0b5c33' }}>{noteSuccess}</p>}
      {noteError && <p role="alert" style={{ color: '#a22' }}>{noteError}</p>}
      {priorNotes.filter(n => n.reportWeekId === noteEntry.week.id || (!n.reportWeekId && n.assignmentId === noteEntry.assignment.id && n.context?.split(' · ').at(-1) === noteEntry.week.name)).length > 0 && <div style={{ marginTop: 12, borderTop: '1px solid #dce5de', paddingTop: 10 }}>
        <strong style={{ fontSize: 13 }}>الملاحظات السابقة وردود المعلمة</strong>
        {priorNotes.filter(n => n.reportWeekId === noteEntry.week.id || (!n.reportWeekId && n.assignmentId === noteEntry.assignment.id && n.context?.split(' · ').at(-1) === noteEntry.week.name)).map(n => <div key={n.id} style={{ padding: 9, border: '1px solid #e2eae5', borderRadius: 7, marginTop: 7, fontSize: 13 }}>
          <div>{n.text}</div>
          {n.reply && <div style={{ marginTop: 5, color: colors.primary }}>رد المعلمة: {n.reply}</div>}
          <small style={{ color: colors.textMuted }}>{n.completedAt ? 'تمت المتابعة' : n.kind === 'action' ? 'بانتظار المتابعة' : 'للاطلاع'}</small>
        </div>)}
      </div>}
    </div>}
    <div style={{ display: 'grid', gap: 18 }}>
      {Array.from(new Map(rows.map(row => {
        const ref = row.measurement || row.linked[0];
        return [ref.assignment.id || ref.assignment.classId + ':' + ref.assignment.subject, ref.assignment];
      })).entries()).map(([assignmentKey, assignment]) => {
        const classRows = rows.filter(row => {
          const a = (row.measurement || row.linked[0]).assignment;
          return (a.id || a.classId + ':' + a.subject) === assignmentKey;
        });
        const metric = (label, value, kind) => <div style={{ textAlign: 'center', flex: 1, minWidth: 0, background: kind === 'measurement' ? '#eaf3fa' : '#fff1e5', padding: '8px 3px', borderRadius: 7 }}>
          <div style={{ fontSize: 11, color: kind === 'measurement' ? '#3a6581' : '#95602e' }}>{label}</div>
          <strong style={{ display: 'block', fontSize: 18, marginTop: 4, color: '#20362c' }}>{value == null ? '—' : value + '%'}</strong>
        </div>;
        const pane = (entry, kind, show) => <div style={{ flex: 1, minWidth: 0, padding: 9, background: kind === 'measurement' ? '#f4f9fd' : '#fff9f3', border: '1px solid ' + (kind === 'measurement' ? '#d4e7f5' : '#f3dfca'), borderRadius: 9 }}>
          {show && entry && <>
            <div style={{ fontSize: 12, fontWeight: 700, color: kind === 'measurement' ? '#17618b' : '#98521b', marginBottom: 5 }}>{kind === 'measurement' ? 'القياس' : 'المعالجة والمتابعة'}</div>
            {weekControl(entry)}
            <div style={{ display: 'flex', gap: 5, marginTop: 9 }}>
              {metric(kind === 'measurement' ? 'اكتمال الرصد' : 'اكتمال المعالجة', entry.completion, kind)}
              {metric(kind === 'measurement' ? 'الإتقان' : 'الإتقان بعد المعالجة', entry.mastery, kind)}
            </div>
          </>}
        </div>;
        return <section key={assignmentKey} style={{ border: '1px solid #d6e2da', borderRadius: 12, overflow: 'hidden' }}>
          <header style={{ background: '#e8f1eb', padding: '12px 14px', borderBottom: '1px solid #d6e2da', color: '#204e38', fontWeight: 700 }}>
            {assignment.className || assignment.classId} <span style={{ color: '#658174', fontWeight: 400 }}> | {assignment.subject || 'المادة'}</span>
            <span style={{ float: 'left', fontSize: 12, fontWeight: 400 }}>{classRows.length} قياس/سجل</span>
          </header>
          <div style={{ padding: 10, display: 'grid', gap: 10 }}>
            {classRows.map((row, i) => {
              const m = row.measurement;
              const treatments = row.linked.length ? row.linked : [null];
              return <article key={(m?.week.id || 'unlinked') + i} style={{ borderBottom: i < classRows.length - 1 ? '1px solid #e2e9e4' : 'none', paddingBottom: i < classRows.length - 1 ? 10 : 0 }}>
                {treatments.map((t, index) => <div key={t?.week.id || 'empty'} style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginTop: index ? 8 : 0 }}>
                  {pane(m, 'measurement', index === 0)}
                  {pane(t, 'remediation', Boolean(t))}
                </div>)}
              </article>;
            })}
          </div>
        </section>;
      })}
    </div>
  </section>;
}
