import { useState } from 'react';
import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { listWeeksForClass } from '../lib/weeksApi';
import { listSkillsForWeek } from '../lib/skillsApi';
import { colors, spacing, radius } from '../lib/theme';

export default function ScanActions({ schoolId }) {
  const [scanning, setScanning] = useState(false);
  const [suspicious, setSuspicious] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');

  async function runScan() {
    setScanning(true);
    setMessage('');
    setSuspicious(null);
    setSelected(new Set());

    try {
      const actionsQ = query(
        collection(db, 'schools', schoolId, 'actions'),
        where('status', '==', 'active'),
      );
      const actionsSnap = await getDocs(actionsQ);
      const actions = actionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // نبني ذاكرة تخزين مؤقت: لكل (classId + teacherUid) نجمع كل عناوين المهارات
      // اللي سبق للمعلمة رصدها في أي أسبوع من أسابيعها بهذا الفصل
      const teacherSkillsCache = {};

      async function getTeacherSkillTitles(classId, teacherUid) {
        const cacheKey = `${classId}__${teacherUid}`;
        if (teacherSkillsCache[cacheKey]) return teacherSkillsCache[cacheKey];

        const weeks = await listWeeksForClass(schoolId, classId, teacherUid);
        const titlesSet = new Set();
        for (const week of weeks) {
          // eslint-disable-next-line no-await-in-loop
          const skills = await listSkillsForWeek(schoolId, week.id);
          skills.forEach((s) => titlesSet.add(s.title.trim()));
        }
        teacherSkillsCache[cacheKey] = titlesSet;
        return titlesSet;
      }

      const flagged = [];
      for (const action of actions) {
        // eslint-disable-next-line no-await-in-loop
        const teacherTitles = await getTeacherSkillTitles(action.classId, action.teacherUid);
        const affected = action.affectedSkillTitles || [];
        const matchesAny = affected.some((t) => teacherTitles.has((t || '').trim()));
        if (affected.length > 0 && !matchesAny) {
          flagged.push(action);
        }
      }

      setSuspicious(flagged);
      if (flagged.length === 0) setMessage('لم يتم العثور على أي إجراءات مشبوهة. البيانات نظيفة.');
    } catch (err) {
      setMessage('خطأ أثناء الفحص: ' + (err.message || err));
    } finally {
      setScanning(false);
    }
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(suspicious.map((a) => a.id)));
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    setDeleting(true);
    setMessage('');
    try {
      for (const actionId of selected) {
        // eslint-disable-next-line no-await-in-loop
        await deleteDoc(doc(db, 'schools', schoolId, 'actions', actionId));
      }
      setSuspicious((prev) => prev.filter((a) => !selected.has(a.id)));
      setMessage(`تم حذف ${selected.size} إجراء بنجاح.`);
      setSelected(new Set());
    } catch (err) {
      setMessage('خطأ أثناء الحذف: ' + (err.message || err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: spacing.lg }} dir="rtl">
      <h2>أداة فحص الإجراءات المتعارضة</h2>
      <p style={{ color: colors.textMuted, fontSize: 13 }}>
        تفحص هذي الأداة كل الإجراءات النشطة بمدرستك، وتكشف أي إجراء مهاراته المذكورة لا تنتمي لمادة المعلمة المسؤولة عنه.
      </p>

      <button
        onClick={runScan}
        disabled={scanning}
        style={{ padding: '10px 20px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button, marginBottom: spacing.md }}
      >
        {scanning ? '...جارٍ الفحص' : 'بدء الفحص'}
      </button>

      {message && (
        <div style={{ background: colors.primaryTint, color: '#0b5c33', padding: 10, borderRadius: radius.button, marginBottom: spacing.md }}>
          {message}
        </div>
      )}

      {suspicious && suspicious.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <span>تم العثور على {suspicious.length} إجراء مشبوه</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={selectAll} style={{ background: 'none', border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: '6px 12px', fontSize: 12 }}>
                تحديد الكل
              </button>
              <button
                onClick={deleteSelected}
                disabled={deleting || selected.size === 0}
                style={{ background: colors.red, color: '#fff', border: 'none', borderRadius: radius.button, padding: '6px 12px', fontSize: 12 }}
              >
                {deleting ? '...جارٍ الحذف' : `حذف المحدد (${selected.size})`}
              </button>
            </div>
          </div>

          {suspicious.map((a) => (
            <div key={a.id} style={{ border: `1px solid ${colors.redBorder}`, background: colors.redTint, borderRadius: radius.card, padding: spacing.md, marginBottom: spacing.sm }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} style={{ marginTop: 4 }} />
                <div style={{ fontSize: 13 }}>
                  <div><strong>الطالبة:</strong> {a.studentName}</div>
                  <div><strong>النوع:</strong> {a.type === 'remedial' ? 'علاجي' : 'إثرائي'}</div>
                  <div><strong>المهارات المذكورة:</strong> {(a.affectedSkillTitles || []).join('، ')}</div>
                  <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                    Action ID: {a.id} — Teacher: {a.teacherUid} — Class: {a.classId}
                  </div>
                </div>
              </label>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
