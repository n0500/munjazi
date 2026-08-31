import { useEffect, useRef, useState } from 'react';
import { listClasses, listTeacherAssignments } from '../lib/classesApi';
import {
  suggestCandidates,
  createPlan,
  listPlansForTeacher,
  closePlan,
  addFollowUp,
  listFollowUps,
  suggestFollowUpText,
  FOLLOW_UP_PRESETS,
} from '../lib/remediationApi';
import { STATUS_LABELS, STATUS_ICONS, STATUS_COLORS } from '../lib/recommendationsApi';
import { getSchool } from '../lib/schoolsApi';
import { exportElementToPdf } from '../lib/pdfExport';

const STATUS_TEXT = { active: 'نشطة', closedSuccess: 'أُغلقت — نجحت', closedFailure: 'أُغلقت — لم تنجح' };

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ar-SA');
  } catch {
    return '—';
  }
}

export default function RemediationPlans({ schoolId, teacherUid, teacherName, onBack }) {
  const [assignments, setAssignments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedPlanId, setExpandedPlanId] = useState(null);
  const [followUpsByPlan, setFollowUpsByPlan] = useState({});
  const [suggestedTextByPlan, setSuggestedTextByPlan] = useState({});
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [creatingPlanKey, setCreatingPlanKey] = useState(null);

  const [pdfPlan, setPdfPlan] = useState(null);
  const [pdfFollowUps, setPdfFollowUps] = useState([]);
  const [schoolInfo, setSchoolInfo] = useState(null);
  const pdfRef = useRef(null);

  const classNameFor = (classId) => classes.find((c) => c.id === classId)?.name || '؟';
  const subjectFor = (classId) => assignments.find((a) => a.classId === classId)?.subject || '';

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [assignRows, classRows, planRows] = await Promise.all([
        listTeacherAssignments(schoolId, teacherUid),
        listClasses(schoolId),
        listPlansForTeacher(schoolId, teacherUid),
      ]);
      setAssignments(assignRows);
      setClasses(classRows);
      setPlans(planRows);

      const allCandidates = [];
      for (const a of assignRows) {
        // eslint-disable-next-line no-await-in-loop
        const rows = await suggestCandidates(schoolId, a.classId, teacherUid);
        rows.forEach((r) => allCandidates.push({ ...r, classId: a.classId }));
      }
      setCandidates(allCandidates);
    } catch (err) {
      setError(err.message || 'تعذّر تحميل الخطط العلاجية.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, teacherUid]);

  async function handleCreateFromCandidate(candidate) {
    setError('');
    const key = `${candidate.studentId}__${candidate.skillTitle}`;
    setCreatingPlanKey(key);
    try {
      await createPlan(schoolId, {
        studentId: candidate.studentId,
        studentName: candidate.studentName,
        classId: candidate.classId,
        teacherUid,
        skillTitle: candidate.skillTitle,
        weekId: candidate.weekId,
        enrichmentLink: candidate.enrichmentLink,
        initialStatus: candidate.lastStatus,
      });
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر إنشاء الخطة العلاجية.');
    } finally {
      setCreatingPlanKey(null);
    }
  }

  async function handleExpandPlan(plan) {
    if (expandedPlanId === plan.id) {
      setExpandedPlanId(null);
      return;
    }
    setExpandedPlanId(plan.id);
    setFollowUpDraft('');
    if (!followUpsByPlan[plan.id]) {
      const rows = await listFollowUps(schoolId, plan.id);
      setFollowUpsByPlan((prev) => ({ ...prev, [plan.id]: rows }));
    }
    if (!suggestedTextByPlan[plan.id]) {
      const text = await suggestFollowUpText(schoolId, plan, plan.classId, teacherUid);
      setSuggestedTextByPlan((prev) => ({ ...prev, [plan.id]: text }));
      setFollowUpDraft(text);
    } else {
      setFollowUpDraft(suggestedTextByPlan[plan.id]);
    }
  }

  async function handleAddFollowUp(plan) {
    setError('');
    if (!followUpDraft.trim()) return;
    try {
      await addFollowUp(schoolId, { planId: plan.id, studentId: plan.studentId, text: followUpDraft });
      const rows = await listFollowUps(schoolId, plan.id);
      setFollowUpsByPlan((prev) => ({ ...prev, [plan.id]: rows }));
      setFollowUpDraft('');
    } catch (err) {
      setError(err.message || 'تعذّر إضافة المتابعة.');
    }
  }

  async function handleClose(plan, outcome) {
    setError('');
    try {
      await closePlan(schoolId, plan.id, outcome);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر إغلاق الخطة.');
    }
  }

  async function handleExportPdf(plan) {
    setError('');
    try {
      const [school, followUps] = await Promise.all([
        getSchool(schoolId),
        listFollowUps(schoolId, plan.id),
      ]);
      setSchoolInfo(school);
      setPdfFollowUps(followUps);
      setPdfPlan(plan);
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (pdfRef.current) {
        await exportElementToPdf(pdfRef.current, `خطة-علاجية-${plan.studentName}.pdf`);
      }
    } catch (err) {
      setError(err.message || 'تعذّر توليد التقرير.');
    }
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  const activePlans = plans.filter((p) => p.status === 'active');
  const closedPlans = plans.filter((p) => p.status !== 'active');

  return (
    <div style={{ maxWidth: 700, margin: '20px auto', padding: 16 }} dir="rtl">
      {onBack && (
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#0b7a4b', marginBottom: 10 }}>
          ← العودة إلى لوحة المعلّمة
        </button>
      )}
      <h1>الخطط العلاجية</h1>

      {error && <div style={{ background: '#fdecea', color: '#a10000', padding: 10, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {candidates.length > 0 && (
        <div style={{ border: '1px solid #d99a00', background: '#fff9ec', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>مرشّحات لخطة علاجية ({candidates.length})</h3>
          {candidates.map((c) => {
            const key = `${c.studentId}__${c.skillTitle}`;
            return (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', padding: '8px 0' }}>
                <div style={{ fontSize: 13 }}>
                  <strong>{c.studentName}</strong> — {c.skillTitle} ({classNameFor(c.classId)})
                  <div style={{ color: '#8a5a00' }}>{c.lastStatusLabel} خلال آخر أسبوعين (حتى {c.weekName})</div>
                </div>
                <button
                  onClick={() => handleCreateFromCandidate(c)}
                  disabled={creatingPlanKey === key}
                  style={{ padding: '6px 12px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, whiteSpace: 'nowrap' }}
                >
                  {creatingPlanKey === key ? '...' : 'إنشاء خطة'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <h3>الخطط النشطة ({activePlans.length})</h3>
      {activePlans.length === 0 ? (
        <p style={{ color: '#666' }}>لا توجد خطط علاجية نشطة حاليًا.</p>
      ) : (
        activePlans.map((plan) => (
          <div key={plan.id} style={{ border: '1px solid #ddd', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
              <div>
                <strong>{plan.studentName}</strong> — {plan.skillTitle}
                <div style={{ fontSize: 12, color: '#666' }}>
                  {classNameFor(plan.classId)} · بدأت: {formatDate(plan.startDate?.toDate ? plan.startDate.toDate() : plan.startDate)} · مراجعة متوقّعة: {formatDate(plan.reviewDate)}
                </div>
                {plan.enrichmentLink && (
                  <div style={{ fontSize: 12 }}>
                    <a href={plan.enrichmentLink} target="_blank" rel="noreferrer">الرابط الإثرائي</a>
                  </div>
                )}
                {plan.action && <p style={{ fontSize: 13, marginTop: 4 }}><strong>الإجراء:</strong> {plan.action}</p>}
              </div>
              <button onClick={() => handleExpandPlan(plan)} style={{ padding: '6px 10px', background: '#f2f2f2', border: 'none', borderRadius: 8, fontSize: 12 }}>
                {expandedPlanId === plan.id ? 'إخفاء المتابعة' : 'سجل المتابعة'}
              </button>
            </div>

            {expandedPlanId === plan.id && (
              <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 10 }}>
                
