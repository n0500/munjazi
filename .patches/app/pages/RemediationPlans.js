import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { listClasses, listTeacherAssignments } from '../lib/classesApi.js';
import { suggestCandidates, createPlan, listPlansForTeacher, cleanupOrphanPlansForTeacher, closePlan, getPlanImpact, addFollowUp, listFollowUps, suggestFollowUpText, FOLLOW_UP_PRESETS, } from '../lib/remediationApi.js';
import { getSchool } from '../lib/schoolsApi.js';
import { dedupeAssignmentsForDisplay, normalizeSubject } from '../lib/dataLogic.js';
import { colors, font, radius, spacing } from '../lib/theme.js';
import RemediationPlanDocument from './RemediationPlanDocument.js';
const STATUS_TEXT = { active: 'نشطة', closedSuccess: 'أغلقت — تحقق الإتقان', closedPartial: 'أغلقت — تحسن جزئي', closedFailure: 'أغلقت — دون تحسن' };
function formatDate(value) {
    if (!value)
        return '—';
    try {
        const date = value.toDate ? value.toDate() : new Date(value);
        return date.toLocaleDateString('ar-SA');
    }
    catch {
        return '—';
    }
}
async function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
export default function RemediationPlans({ schoolId, teacherUid, teacherName, onBack = null }) {
    const [assignments, setAssignments] = useState([]);
    const [historicalAssignments, setHistoricalAssignments] = useState([]);
    const [classes, setClasses] = useState([]);
    const [candidates, setCandidates] = useState([]);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [cleanupMessage, setCleanupMessage] = useState('');
    const [expandedPlanId, setExpandedPlanId] = useState(null);
    const [followUpsByPlan, setFollowUpsByPlan] = useState({});
    const [suggestedTextByPlan, setSuggestedTextByPlan] = useState({});
    const [followUpDraft, setFollowUpDraft] = useState('');
    const [impactByPlan, setImpactByPlan] = useState({});
    const [impactLoadingId, setImpactLoadingId] = useState(null);
    const [creatingPlanKey, setCreatingPlanKey] = useState(null);
    const [selectedCandidateKeys, setSelectedCandidateKeys] = useState(new Set());
    const [batchCreating, setBatchCreating] = useState(false);
    const [exportingPlanId, setExportingPlanId] = useState(null);
    const classNameFor = (classId) => classes.find((c) => c.id === classId)?.name || '؟';
    const assignmentForPlan = (plan) => {
        if (plan.assignmentId)
            return historicalAssignments.find((a) => a.id === plan.assignmentId) || null;
        const sameClass = historicalAssignments.filter((a) => a.classId === plan.classId && a.teacherUid === teacherUid);
        const bySubject = new Map();
        sameClass.forEach((a) => {
            const key = normalizeSubject(a.subject);
            if (!bySubject.has(key))
                bySubject.set(key, a);
        });
        return bySubject.size === 1 ? [...bySubject.values()][0] : null;
    };
    const subjectForPlan = (plan) => plan.subject || assignmentForPlan(plan)?.subject || 'مادة غير محددة';
    async function refresh() {
        setLoading(true);
        setError('');
        try {
            const cleanup = await cleanupOrphanPlansForTeacher(schoolId, teacherUid);
            setCleanupMessage(cleanup.cleanedCount > 0 ? `تم حذف ${cleanup.cleanedCount} خطة علاجية لا يوجد أسبوعها في النظام.` : '');
            const [assignRows, classRows, planRows] = await Promise.all([
                listTeacherAssignments(schoolId, teacherUid, { includeInactive: true }),
                listClasses(schoolId),
                listPlansForTeacher(schoolId, teacherUid),
            ]);
            setHistoricalAssignments(assignRows);
            const activeAssignments = dedupeAssignmentsForDisplay(assignRows);
            setAssignments(activeAssignments);
            setClasses(classRows);
            setPlans(planRows.filter((p) => p.status !== 'deleted'));
            const allCandidates = [];
            for (const a of activeAssignments) {
                // eslint-disable-next-line no-await-in-loop
                const rows = await suggestCandidates(schoolId, a.classId, teacherUid, a.id);
                rows.forEach((r) => allCandidates.push({ ...r, classId: a.classId, assignmentId: a.id, subject: a.subject || '' }));
            }
            setCandidates(allCandidates);
            setSelectedCandidateKeys(new Set());
        }
        catch (err) {
            setError(err.message || 'تعذر تحميل الخطط العلاجية.');
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schoolId, teacherUid]);
    const candidateKey = (candidate) => `${candidate.assignmentId}__${candidate.studentId}__${candidate.skillTitle}`;
    function toggleCandidate(candidate) {
        const key = candidateKey(candidate);
        setSelectedCandidateKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }
    async function handleCreateBatch() {
        const selected = candidates.filter((candidate) => selectedCandidateKeys.has(candidateKey(candidate)));
        if (selected.length === 0) return;
        const first = selected[0];
        const sameGroup = selected.every((candidate) => candidate.assignmentId === first.assignmentId && candidate.classId === first.classId && candidate.skillTitle === first.skillTitle);
        if (!sameGroup) {
            window.alert('لإنشاء تدخل جماعي، اختاري طالبات من الفصل والمادة والمهارة نفسها.');
            return;
        }
        const defaultText = `تدخل علاجي لمهارة ${first.skillTitle}`;
        const actionText = window.prompt(`سيتم إنشاء خطة اختيارية لـ ${selected.length} طالبات في مهارة ${first.skillTitle}. اكتبي نص الإجراء المشترك أو اختاري إلغاء.`, defaultText);
        if (actionText === null) return;
        if (!actionText.trim()) {
            window.alert('نص الإجراء مطلوب لإنشاء الخطط.');
            return;
        }
        setBatchCreating(true);
        setError('');
        try {
            for (const candidate of selected) {
                // eslint-disable-next-line no-await-in-loop
                await createPlan(schoolId, {
                    studentId: candidate.studentId,
                    studentName: candidate.studentName,
                    classId: candidate.classId,
                    teacherUid,
                    assignmentId: candidate.assignmentId,
                    subject: candidate.subject,
                    skillTitle: candidate.skillTitle,
                    weekId: candidate.weekId,
                    action: actionText.trim(),
                    enrichmentLink: candidate.enrichmentLink,
                    initialStatus: candidate.lastStatus,
                });
            }
            setSelectedCandidateKeys(new Set());
            await refresh();
        }
        catch (err) {
            setError(err.message || 'تعذّر إنشاء الخطط العلاجية المحددة.');
        }
        finally {
            setBatchCreating(false);
        }
    }
    async function handleCreateFromCandidate(candidate) {
        setError('');
        const defaultText = `تدخل علاجي لمهارة ${candidate.skillTitle}`;
        const actionText = window.prompt(`اكتبي نص الإجراء العلاجي للطالبة ${candidate.studentName}. يمكنك الإلغاء وترك الحالة دون خطة.`, defaultText);
        if (actionText === null)
            return;
        if (!actionText.trim()) {
            window.alert('نص الإجراء مطلوب لإنشاء الخطة.');
            return;
        }
        const key = `${candidate.assignmentId}__${candidate.studentId}__${candidate.skillTitle}`;
        setCreatingPlanKey(key);
        try {
            await createPlan(schoolId, {
                studentId: candidate.studentId,
                studentName: candidate.studentName,
                classId: candidate.classId,
                teacherUid,
                assignmentId: candidate.assignmentId,
                subject: candidate.subject,
                skillTitle: candidate.skillTitle,
                weekId: candidate.weekId,
                action: actionText.trim(),
                enrichmentLink: candidate.enrichmentLink,
                initialStatus: candidate.lastStatus,
            });
            await refresh();
        }
        catch (err) {
            setError(err.message || 'تعذّر إنشاء الخطة العلاجية.');
        }
        finally {
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
        setImpactLoadingId(plan.id);
        try {
            const impact = await getPlanImpact(schoolId, plan, teacherUid);
            setImpactByPlan(prev => ({ ...prev, [plan.id]: impact }));
        } catch (err) {
            setError(err.message || 'تعذر حساب الأثر.');
        } finally {
            setImpactLoadingId(null);
        }
        if (!followUpsByPlan[plan.id]) {
            const rows = await listFollowUps(schoolId, plan.id);
            setFollowUpsByPlan((prev) => ({ ...prev, [plan.id]: rows }));
        }
        if (!suggestedTextByPlan[plan.id]) {
            const text = await suggestFollowUpText(schoolId, plan, plan.classId, teacherUid);
            setSuggestedTextByPlan((prev) => ({ ...prev, [plan.id]: text }));
            setFollowUpDraft(text);
        }
        else {
            setFollowUpDraft(suggestedTextByPlan[plan.id]);
        }
    }
    async function handleAddFollowUp(plan) {
        setError('');
        if (!followUpDraft.trim())
            return;
        try {
            await addFollowUp(schoolId, { planId: plan.id, studentId: plan.studentId, text: followUpDraft });
            const rows = await listFollowUps(schoolId, plan.id);
            setFollowUpsByPlan((prev) => ({ ...prev, [plan.id]: rows }));
            setFollowUpDraft('');
        }
        catch (err) {
            setError(err.message || 'تعذّر إضافة المتابعة.');
        }
    }
    async function handleClose(plan) {
        setError('');
        try {
            const impact = await getPlanImpact(schoolId, plan, teacherUid);
            if (!impact) throw new Error('أضيفي قياسًا جديدًا بعد بدء الخطة للمهارة نفسها قبل الإغلاق.');
            const outcome = impact.after === 'mastered' ? 'success' : impact.change === 'improved' ? 'partial' : 'failure';
            await closePlan(schoolId, plan.id, outcome, impact);
            await refresh();
            setExpandedPlanId(null);
        }
        catch (err) {
            setError(err.message || 'تعذّر اعتماد القياس وإغلاق الخطة.');
        }
    }
    async function handleExportPdf(plan) {
        setError('');
        setExportingPlanId(plan.id);
        try {
            const [school, followUps] = await Promise.all([
                getSchool(schoolId),
                listFollowUps(schoolId, plan.id),
            ]);
            const blob = await pdf(_jsx(RemediationPlanDocument, { plan: plan, followUps: followUps, schoolName: school.name, principalName: school.principalName || '', teacherName: teacherName, className: classNameFor(plan.classId), subject: subjectForPlan(plan) })).toBlob();
            await downloadBlob(blob, `خطة-علاجية-${plan.studentName}.pdf`);
        }
        catch (err) {
            setError(err.message || 'تعذّر توليد التقرير.');
        }
        finally {
            setExportingPlanId(null);
        }
    }
    if (loading)
        return _jsx("p", { style: { textAlign: 'center', marginTop: 60 }, children: "...\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644" });
    const activePlans = plans.filter((p) => p.status === 'active');
    const closedPlans = plans.filter((p) => p.status !== 'active');
    return (_jsxs("div", { style: { maxWidth: 700, margin: '0 auto', padding: spacing.lg }, dir: "rtl", children: [onBack && _jsx("button", { onClick: onBack, style: { background: 'none', border: 'none', color: colors.primary, marginBottom: spacing.sm }, children: "\u2190 \u0627\u0644\u0639\u0648\u062F\u0629" }), _jsx("h2", { style: { fontFamily: font.family, color: colors.ink }, children: "\u0627\u0644\u062E\u0637\u0637 \u0627\u0644\u0639\u0644\u0627\u062C\u064A\u0629" }), error && _jsx("div", { style: { background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.md }, children: error }), cleanupMessage && _jsx("div", { style: { background: colors.primaryTint, color: '#0b5c33', padding: 10, border: `1px solid ${colors.primary}`, borderRadius: radius.button, marginBottom: spacing.md, fontSize: 12 }, children: cleanupMessage }), _jsxs("div", { style: { border: `1px solid ${colors.primary}`, background: colors.primaryTint, borderRadius: radius.card, padding: spacing.md, marginBottom: spacing.lg }, children: [_jsx("strong", { children: "\u0627\u0644\u062e\u0637\u0637 \u0627\u0644\u0639\u0644\u0627\u062c\u064a\u0629 \u0627\u062e\u062a\u064a\u0627\u0631\u064a\u0629" }), _jsx("div", { style: { fontSize: 12, color: colors.textMuted, marginTop: 4 }, children: "\u064a\u0645\u0643\u0646\u0643 \u0625\u0643\u0645\u0627\u0644 \u0631\u0635\u062f \u062c\u0645\u064a\u0639 \u0627\u0644\u0623\u0633\u0627\u0628\u064a\u0639 \u062f\u0648\u0646 \u0625\u0646\u0634\u0627\u0621 \u0623\u064a \u062e\u0637\u0629. \u0627\u0644\u062d\u0627\u0644\u0627\u062a \u0623\u062f\u0646\u0627\u0647 \u0645\u0631\u0634\u062d\u0627\u062a \u0641\u0642\u0637\u060c \u0648\u0623\u0646\u062a \u062a\u0642\u0631\u0631\u064a\u0646 \u0645\u0627 \u0625\u0630\u0627 \u0643\u0627\u0646\u062a \u062a\u062d\u062a\u0627\u062c \u062a\u062f\u062e\u0644\u0627\u064b \u0639\u0644\u0627\u062c\u064a\u0627\u064b." })] }), candidates.length > 0 && (_jsxs("div", { style: { border: `1px solid ${colors.amberBorder}`, background: colors.amberTint, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.xl }, children: [_jsxs("h3", { style: { marginTop: 0, fontFamily: font.family }, children: ["\u062D\u0627\u0644\u0627\u062A \u0645\u0631\u0634\u062D\u0629 \u0644\u0644\u062A\u062F\u062E\u0644 \u0627\u0644\u0639\u0644\u0627\u062C\u064A \u2014 \u0627\u062E\u062A\u064A\u0627\u0631\u064A (", candidates.length, ")"] }), selectedCandidateKeys.size > 0 && _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', marginBottom: 6, borderBottom: `1px solid ${colors.amberBorder}` }, children: [_jsxs("span", { style: { fontSize: 12, color: colors.ink }, children: ["تم تحديد ", selectedCandidateKeys.size, " حالة"] }), _jsx("button", { onClick: handleCreateBatch, disabled: batchCreating, style: { padding: '7px 12px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button, fontSize: 12 }, children: batchCreating ? '...' : 'إنشاء تدخل مشترك للمحددات' })] }), candidates.map((c) => {
                        const key = `${c.assignmentId}__${c.studentId}__${c.skillTitle}`;
                        return (_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${colors.border}`, padding: '8px 0', gap: 8 }, children: [_jsx("input", { type: "checkbox", checked: selectedCandidateKeys.has(key), onChange: () => toggleCandidate(c), title: "تحديد لإنشاء تدخل جماعي", style: { width: 18, height: 18, flex: '0 0 auto' } }), _jsxs("div", { style: { fontSize: 13, flex: 1 }, children: [_jsx("strong", { children: c.studentName }), " \u2014 ", c.skillTitle, _jsxs("div", { children: [c.subject, " \u2014 ", classNameFor(c.classId)] }), _jsxs("div", { style: { color: colors.amber }, children: [c.lastStatusLabel, " — ", c.weekName, c.repeated ? " · متكررة من أسبوع سابق" : " · حالة حالية"] })] }), _jsx("button", { onClick: () => handleCreateFromCandidate(c), disabled: creatingPlanKey === key, style: { padding: '6px 12px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button, fontSize: 13 }, children: creatingPlanKey === key ? '...' : 'إنشاء خطة علاجية' })] }, key));
                    })] })), candidates.length === 0 && _jsx("p", { style: { color: colors.textMuted, fontSize: 13 }, children: "\u0644\u0627 \u062a\u0648\u062c\u062f \u062d\u0627\u0644\u0627\u062a \u0645\u0631\u0634\u062d\u0629 \u0644\u0644\u062a\u062f\u062e\u0644 \u0627\u0644\u0639\u0644\u0627\u062c\u064a \u062d\u0627\u0644\u064a\u0627." }), _jsxs("h3", { style: { fontFamily: font.family }, children: ["\u0627\u0644\u062E\u0637\u0637 \u0627\u0644\u0646\u0634\u0637\u0629 (", activePlans.length, ")"] }), activePlans.length === 0 ? _jsx("p", { style: { color: colors.textMuted }, children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u062E\u0637\u0637 \u0639\u0644\u0627\u062C\u064A\u0629 \u0646\u0634\u0637\u0629 \u062D\u0627\u0644\u064A\u064B\u0627." }) : activePlans.map((plan) => (_jsxs("div", { style: { border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.md, marginBottom: spacing.md }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }, children: [_jsxs("div", { children: [_jsx("strong", { children: plan.studentName }), " \u2014 ", plan.skillTitle, _jsxs("div", { style: { fontSize: 12, color: colors.textMuted }, children: [subjectForPlan(plan), " \u00B7 ", classNameFor(plan.classId), " \u00B7 \u0628\u062F\u0623\u062A: ", formatDate(plan.startDate)] }), plan.enrichmentLink && _jsx("div", { style: { fontSize: 12 }, children: _jsx("a", { href: plan.enrichmentLink, target: "_blank", rel: "noreferrer", style: { color: colors.primary }, children: "\u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0625\u062B\u0631\u0627\u0626\u064A" }) }), plan.action && _jsxs("p", { style: { fontSize: 13, marginTop: 4 }, children: [_jsx("strong", { children: "\u0627\u0644\u0625\u062C\u0631\u0627\u0621:" }), " ", plan.action] })] }), _jsx("button", { onClick: () => handleExpandPlan(plan), style: { padding: '6px 10px', background: '#f2f2f2', border: 'none', borderRadius: radius.button, fontSize: 12 }, children: expandedPlanId === plan.id ? 'إخفاء المتابعة' : 'سجل المتابعة' })] }), expandedPlanId === plan.id && (_jsxs("div", { style: { marginTop: spacing.md, borderTop: `1px solid ${colors.border}`, paddingTop: spacing.sm }, children: [_jsx("div", { style: { padding: 12, marginBottom: 12, borderRadius: 8, background: colors.primaryTint, fontSize: 13 }, children: impactLoadingId === plan.id ? "جارٍ فحص القياس..." : impactByPlan[plan.id] ? `أثر المعالجة | قبل: ${impactByPlan[plan.id].baseline} ← بعد: ${impactByPlan[plan.id].after} | ${impactByPlan[plan.id].change === "improved" ? "تحسن" : impactByPlan[plan.id].change === "declined" ? "تراجع" : "دون تغيير"} | ${impactByPlan[plan.id].measurements.map(m => m.weekName).join("، ")}` : "لا يوجد قياس لاحق موثق لجميع المهارات المرتبطة بالخطة. أضيفي القياس في أسبوع جديد من نوع «قياس» قبل إغلاقها." }), _jsx("textarea", { value: followUpDraft, onChange: (e) => setFollowUpDraft(e.target.value), style: { width: '100%', padding: 8, fontSize: 13, minHeight: 50, boxSizing: 'border-box' } }), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }, children: [_jsxs("select", { value: "", onChange: (e) => e.target.value && setFollowUpDraft(e.target.value), style: { padding: 6, fontSize: 12 }, children: [_jsx("option", { value: "", children: "\u0627\u062E\u062A\u064A\u0627\u0631 \u0639\u0628\u0627\u0631\u0629 \u062C\u0627\u0647\u0632\u0629" }), FOLLOW_UP_PRESETS.map((preset, i) => _jsx("option", { value: preset, children: preset }, i))] }), _jsx("button", { onClick: () => handleAddFollowUp(plan), style: { padding: '6px 14px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button, fontSize: 13 }, children: "\u0625\u0636\u0627\u0641\u0629 \u0645\u062A\u0627\u0628\u0639\u0629" })] }), (followUpsByPlan[plan.id] || []).map((f) => (_jsxs("div", { style: { fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f2f2f2' }, children: [_jsx("span", { style: { color: colors.textMuted, fontSize: 11 }, children: formatDate(f.createdAt) }), _jsx("div", { children: f.text })] }, f.id))), _jsxs("div", { style: { display: 'flex', gap: 8, marginTop: spacing.sm, flexWrap: 'wrap' }, children: [_jsx("button", { onClick: () => handleClose(plan), disabled: !impactByPlan[plan.id], style: { padding: "6px 12px", background: colors.primaryTint, color: colors.primary, border: `1px solid ${colors.primary}`, borderRadius: radius.button, fontSize: 12 }, children: "اعتماد نتيجة القياس وإغلاق الخطة" }), _jsx("button", { onClick: () => handleExportPdf(plan), disabled: exportingPlanId === plan.id, style: { padding: '6px 12px', background: '#f2f2f2', border: 'none', borderRadius: radius.button, fontSize: 12 }, children: exportingPlanId === plan.id ? '...' : 'تحميل PDF' })] })] }))] }, plan.id))), closedPlans.length > 0 && (_jsxs(_Fragment, { children: [_jsxs("h3", { style: { fontFamily: font.family }, children: ["\u0627\u0644\u062E\u0637\u0637 \u0627\u0644\u0645\u063A\u0644\u0642\u0629 (", closedPlans.length, ")"] }), closedPlans.map((plan) => _jsxs("div", { style: { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: 10, marginBottom: 8, fontSize: 13 }, children: [_jsx("strong", { children: plan.studentName }), " \u2014 ", plan.skillTitle, " \u2014 ", STATUS_TEXT[plan.status], plan.impactEvidence ? ` · قبل: ${plan.impactEvidence.baseline} ← بعد: ${plan.impactEvidence.after}` : ' · لا يوجد قياس آلي مرتبط'] }, plan.id))] }))] }));
}
