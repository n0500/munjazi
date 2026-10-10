import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useRef, useState } from 'react';
import { listWeeksForAssignmentGroup, createWeek, copyWeekToMultipleAssignments, deleteWeekWithData } from '../lib/weeksApi.js';
import { listSkillsForWeek } from '../lib/skillsApi.js';
import { SCHOOL_WEEK_NAMES } from '../lib/schoolWeekNames.js';
import { normalizeSubject, normalizeWeekName } from '../lib/dataLogic.js';
import WeekDetail from './WeekDetail.js';
import { colors, font, radius, spacing } from '../lib/theme.js';
const TYPE_LABELS = { measurement: 'قياس', remediation: 'معالجة' };
function weekTypeLabel(week) {
    if (!week) return '';
    if (week.type !== 'remediation') return TYPE_LABELS[week.type] || week.type;
    return `معالجة ${Math.max(1, Number(week.remediationStage) || 1)}`;
}
export default function ClassWeeks({ schoolId, assignment, allAssignments, historicalAssignments = allAssignments, classNameFor, onBack = null }) {
    const { classId, teacherUid } = assignment;
    const [weeks, setWeeks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [name, setName] = useState('');
    const [type, setType] = useState('measurement');
    const [measurementSourceId, setMeasurementSourceId] = useState('');
    const [opening, setOpening] = useState(false);
    const [selectedWeekId, setSelectedWeekId] = useState(null);
    const [showCopy, setShowCopy] = useState(false);
    const [copySourceId, setCopySourceId] = useState('');
    const [copyName, setCopyName] = useState('');
    const [copyType, setCopyType] = useState('remediation');
    const [copyTargetIds, setCopyTargetIds] = useState(new Set([assignment.id]));
    const [copying, setCopying] = useState(false);
    const copyInFlight = useRef(false);
    const [copyProgress, setCopyProgress] = useState(null);
    const [copyElapsed, setCopyElapsed] = useState(0);
    useEffect(() => {
        if (!copying) return;
        const startedAt = Date.now();
        const timer = setInterval(() => setCopyElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
        return () => clearInterval(timer);
    }, [copying]);
    const [copyResults, setCopyResults] = useState(null);
    const [copySkillOptions, setCopySkillOptions] = useState([]);
    const [copySelectedSkillTitles, setCopySelectedSkillTitles] = useState(new Set());
    const [loadingCopySkills, setLoadingCopySkills] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const sameSubjectAssignments = allAssignments
        .filter((a) => a.teacherUid === teacherUid && normalizeSubject(a.subject) === normalizeSubject(assignment.subject))
        .sort((a, b) => (a.id === assignment.id ? -1 : b.id === assignment.id ? 1 : classNameFor(a.classId).localeCompare(classNameFor(b.classId), 'ar')));
    async function refresh({ quiet = false } = {}) { if (!quiet) setLoading(true); setError(''); try {
        setWeeks(await listWeeksForAssignmentGroup(schoolId, assignment, { allAssignments: historicalAssignments }));
    }
    catch (err) {
        setError(err.message || 'تعذّر تحميل الأسابيع الدراسية.');
    }
    finally {
        if (!quiet) setLoading(false);
    } }
    useEffect(() => { setSelectedWeekId(null); setName(''); setType('measurement'); setMeasurementSourceId(''); setCopySourceId(''); setCopySkillOptions([]); setCopySelectedSkillTitles(new Set()); setCopyTargetIds(new Set([assignment.id])); refresh(); }, [assignment.id]);
    useEffect(() => {
        const sourceWeek = weeks.find((w) => w.id === copySourceId);
        const needsManualSkills = sourceWeek?.type === 'remediation' && copyType === 'remediation';
        if (!needsManualSkills) {
            setCopySkillOptions([]);
            setCopySelectedSkillTitles(new Set());
            return;
        }
        let cancelled = false;
        setLoadingCopySkills(true);
        listSkillsForWeek(schoolId, sourceWeek.id)
            .then((rows) => {
                if (cancelled) return;
                setCopySkillOptions(rows);
                setCopySelectedSkillTitles(new Set());
            })
            .catch((err) => { if (!cancelled) setError(err.message || 'تعذّر تحميل مهارات أسبوع المعالجة.'); })
            .finally(() => { if (!cancelled) setLoadingCopySkills(false); });
        return () => { cancelled = true; };
    }, [copySourceId, copyType, weeks, schoolId]);
    async function handleOpenOrCreate(e) { e.preventDefault(); if (!name || opening)
        return; setOpening(true); setError(''); try {
        const existing = weeks.find(w => normalizeWeekName(w.name) === normalizeWeekName(name) && w.type === type && w.archived !== true);
        if (existing) {
            setSelectedWeekId(existing.id);
        }
        else {
            const created = await createWeek(schoolId, { classId, teacherUid, assignmentId: assignment.id, subject: assignment.subject, name, type, enrichmentLink: '', sourceMeasurementWeekId: type === 'remediation' ? (measurementSourceId || null) : null });
            await refresh();
            setSelectedWeekId(created.id);
        }
    }
    catch (err) {
        setError(err.message || 'تعذّر فتح الأسبوع.');
    }
    finally {
        setOpening(false);
    } }
    function toggleCopyTarget(id) { setCopyTargetIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
    function toggleCopySkill(title) { setCopySelectedSkillTitles(prev => { const next = new Set(prev); next.has(title) ? next.delete(title) : next.add(title); return next; }); }
    async function handleCopy(e) { e.preventDefault(); if (!copySourceId || !copyName || !copyTargetIds.size || copyInFlight.current)
        return;
        const sourceWeek = weeks.find((w) => w.id === copySourceId);
        const manualRemediationCopy = sourceWeek?.type === 'remediation' && copyType === 'remediation';
        if (manualRemediationCopy && copySelectedSkillTitles.size === 0) {
            setError('اختاري مهارة واحدة على الأقل للاستمرار في المعالجة التالية.');
            return;
        }
        copyInFlight.current = true;
        setCopying(true); setCopyElapsed(0); setCopyProgress({ assignmentId: [...copyTargetIds][0], assignmentIndex: 1, totalAssignments: copyTargetIds.size, phase: 'preparing' }); setError(''); setCopyResults(null); try {
        const results = await copyWeekToMultipleAssignments(schoolId, { sourceAssignmentId: assignment.id, sourceWeekId: copySourceId, targetAssignmentIds: [...copyTargetIds], targetName: copyName, targetType: copyType, copyAssessments: true, copyComments: true, selectedSkillTitles: manualRemediationCopy ? [...copySelectedSkillTitles] : null, onProgress: setCopyProgress, onResult: (result) => setCopyResults((previous) => [...(previous || []), result]) });
        setCopyResults(results);
        await refresh({ quiet: true });
        const current = results.find((r) => r.assignmentId === assignment.id && r.ok);
        if (current?.id && results.every((result) => result.ok))
            setSelectedWeekId(current.id);
    }
    catch (err) {
        setError(err.message || 'تعذّر نسخ الأسبوع.');
    }
    finally {
        copyInFlight.current = false;
        setCopying(false);
    } }
    async function handleDelete(week) {
        const msg = `سيتم حذف "${week.name}" نهائيًا مع المهارات والرصد والتوصيات والخطط العلاجية والمتابعات المرتبطة بهذا الأسبوع. لن يمكن استعادته بعد الحذف. هل تريدين الحذف؟`;
        if (!window.confirm(msg))
            return;
        setDeletingId(week.id);
        setError('');
        try {
            await deleteWeekWithData(schoolId, week.id);
            if (copySourceId === week.id) {
                setCopySourceId('');
                setCopySkillOptions([]);
                setCopySelectedSkillTitles(new Set());
            }
            await refresh();
        }
        catch (err) {
            setError(err.message || 'تعذّر حذف الأسبوع.');
        }
        finally {
            setDeletingId(null);
        }
    }
    if (selectedWeekId) {
        const week = weeks.find(w => w.id === selectedWeekId);
        if (week)
            return _jsx(WeekDetail, { schoolId: schoolId, assignment: assignment, allAssignments: allAssignments, historicalAssignments: historicalAssignments, classNameFor: classNameFor, week: week, onBack: () => { setSelectedWeekId(null); refresh(); } });
    }
    if (loading)
        return _jsx("p", { style: { textAlign: 'center', marginTop: 50 }, children: "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644..." });
    return _jsxs("div", { style: { width: '100%', maxWidth: '100%', margin: '0 auto', boxSizing: 'border-box' }, dir: "rtl", children: [onBack && _jsx("button", { onClick: onBack, style: { background: 'none', border: 'none', color: colors.primary, marginBottom: 8 }, children: "\u2190 \u0627\u0644\u0639\u0648\u062F\u0629" }), _jsx("h2", { style: { fontFamily: font.family, color: colors.ink, marginBottom: 4 }, children: "\u0627\u0644\u0631\u0635\u062F" }), _jsxs("p", { style: { color: colors.textMuted, marginTop: 0 }, children: [assignment.subject, " \u2014 ", classNameFor(classId)] }), error && _jsx("div", { style: { background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.md }, children: error }), _jsx("div", { style: { border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.md }, children: _jsxs("form", { onSubmit: handleOpenOrCreate, children: [_jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 150px', gap: 8 }, children: [_jsxs("select", { value: name, onChange: e => setName(e.target.value), required: true, style: { padding: 10 }, children: [_jsx("option", { value: "", children: "\u0627\u062E\u062A\u0627\u0631\u064A \u0627\u0644\u0623\u0633\u0628\u0648\u0639" }), SCHOOL_WEEK_NAMES.map((n) => _jsx("option", { value: n, children: n }, n))] }), _jsxs("select", { value: type, onChange: e => { const next = e.target.value; setType(next); if (next !== 'remediation') setMeasurementSourceId(''); }, required: true, style: { padding: 10, fontWeight: 'bold' }, children: [_jsx("option", { value: "measurement", children: "\u0642\u064A\u0627\u0633" }), _jsx("option", { value: "remediation", children: "\u0645\u0639\u0627\u0644\u062C\u0629" })] })] }), type === 'remediation' && _jsxs("div", { style: { marginTop: 8 }, children: [_jsx("label", { style: { display: 'block', fontSize: 12, color: colors.textMuted, marginBottom: 4 }, children: "ربط بأسبوع قياس (اختياري)" }), _jsxs("select", { value: measurementSourceId, onChange: e => setMeasurementSourceId(e.target.value), style: { width: '100%', padding: 9 }, children: [_jsx("option", { value: "", children: "بدون ربط الآن" }), weeks.filter((w) => w.type === 'measurement' && w.archived !== true).map((w) => _jsx("option", { value: w.id, children: w.name }, w.id))] }), _jsx("div", { style: { fontSize: 11, color: colors.textMuted, marginTop: 3 }, children: "يمكن تعديل الربط لاحقًا من داخل أسبوع المعالجة." })] }), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }, children: [_jsx("button", { type: "submit", disabled: opening || copying || !name, style: { padding: '10px 18px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button, fontWeight: 'bold' }, children: opening ? 'جارٍ الفتح...' : 'فتح / إنشاء الأسبوع' }), _jsxs("button", { type: "button", onClick: () => setShowCopy(v => !v), style: { padding: '10px 18px', background: '#fff', color: colors.ink, border: `1px solid ${colors.border}`, borderRadius: radius.button, fontWeight: 'bold' }, children: ["\u0646\u0633\u062E \u0623\u0633\u0628\u0648\u0639 \u0633\u0627\u0628\u0642 ", showCopy ? '▲' : '▼'] })] })] }) }), showCopy && _jsxs("div", { style: { border: `1px solid ${colors.primary}`, background: colors.primaryTint, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.lg }, children: [_jsx("h3", { style: { marginTop: 0, fontFamily: font.family }, children: "\u0646\u0633\u062E \u0623\u0633\u0628\u0648\u0639 \u0633\u0627\u0628\u0642" }), _jsx("p", { style: { fontSize: 12, color: colors.textMuted }, children: "\u064A\u0646\u0633\u062E \u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062A \u0648\u0627\u0644\u0631\u0635\u062F \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u060C \u0648\u0644\u0627 \u064A\u0646\u0633\u062E \u0627\u0644\u062E\u0637\u0637 \u0627\u0644\u0639\u0644\u0627\u062C\u064A\u0629. \u0644\u0643\u0644 \u0641\u0635\u0644 \u0646\u0633\u062E\u062A\u0647 \u0627\u0644\u0645\u0633\u062A\u0642\u0644\u0629." }), _jsxs("form", { onSubmit: handleCopy, children: [_jsxs("select", { value: copySourceId, disabled: copying, onChange: e => setCopySourceId(e.target.value), required: true, style: { width: '100%', padding: 9, marginBottom: 8 }, children: [_jsx("option", { value: "", children: "\u0627\u0644\u0623\u0633\u0628\u0648\u0639 \u0627\u0644\u0645\u0635\u062F\u0631" }), weeks.map(w => _jsxs("option", { value: w.id, children: [w.name, " \u2014 ", weekTypeLabel(w)] }, w.id))] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 150px', gap: 8, marginBottom: 8 }, children: [_jsxs("select", { value: copyName, disabled: copying, onChange: e => setCopyName(e.target.value), required: true, style: { padding: 9 }, children: [_jsx("option", { value: "", children: "\u0627\u0644\u0623\u0633\u0628\u0648\u0639 \u0627\u0644\u062C\u062F\u064A\u062F" }), SCHOOL_WEEK_NAMES.map((n) => _jsx("option", { value: n, children: n }, n))] }), _jsxs("select", { value: copyType, disabled: copying, onChange: e => setCopyType(e.target.value), style: { padding: 9, fontWeight: 'bold' }, children: [_jsx("option", { value: "measurement", children: "\u0642\u064A\u0627\u0633" }), _jsx("option", { value: "remediation", children: "\u0645\u0639\u0627\u0644\u062C\u0629" })] })] }), (() => { const sourceWeek = weeks.find((w) => w.id === copySourceId); const manualRemediationCopy = sourceWeek?.type === 'remediation' && copyType === 'remediation'; if (!manualRemediationCopy) return null; const nextStage = (Number(sourceWeek.remediationStage) || 1) + 1; return _jsxs("div", { style: { background: '#fff', borderRadius: 8, padding: 10, marginBottom: 8, border: `1px solid ${colors.border}` }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 6 }, children: [_jsxs("strong", { style: { fontSize: 13 }, children: ["اختاري المهارات التي تستمر في معالجة ", nextStage] }), _jsxs("span", { style: { fontSize: 11, color: colors.textMuted }, children: [copySelectedSkillTitles.size, " محددة"] })] }), _jsx("div", { style: { fontSize: 11, color: colors.textMuted, marginBottom: 6 }, children: "سيُنقل الرصد الحالي للمهارات المختارة فقط، ثم تعدلين حالات الطالبات اللاتي تحسنّ." }), loadingCopySkills ? _jsx("div", { style: { fontSize: 12, color: colors.textMuted }, children: "جارٍ تحميل المهارات..." }) : copySkillOptions.length === 0 ? _jsx("div", { style: { fontSize: 12, color: colors.textMuted }, children: "لا توجد مهارات في أسبوع المعالجة المصدر." }) : copySkillOptions.map((skill) => _jsxs("label", { style: { display: 'flex', gap: 7, alignItems: 'center', padding: '5px 0', fontSize: 13 }, children: [_jsx("input", { type: "checkbox", checked: copySelectedSkillTitles.has(skill.title), disabled: copying, onChange: () => toggleCopySkill(skill.title) }), skill.title] }, skill.id))] }); })(), _jsxs("div", { style: { background: '#fff', borderRadius: 8, padding: 8, marginBottom: 8 }, children: [_jsx("strong", { style: { fontSize: 13 }, children: "\u0627\u0644\u0641\u0635\u0648\u0644 \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641\u0629" }), sameSubjectAssignments.map((a) => _jsxs("label", { style: { display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0', fontSize: 13 }, children: [_jsx("input", { type: "checkbox", checked: copyTargetIds.has(a.id), disabled: copying, onChange: () => toggleCopyTarget(a.id) }), classNameFor(a.classId), " ", a.id === assignment.id ? '(الحالي)' : ''] }, a.id))] }), _jsx("button", { type: "submit", disabled: copying || !copyTargetIds.size || (weeks.find((w) => w.id === copySourceId)?.type === 'remediation' && copyType === 'remediation' && copySelectedSkillTitles.size === 0), style: { padding: '9px 14px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }, children: copying ? 'جار النسخ...' : 'نسخ للفصول المحددة' }), copying && copyProgress && _jsxs("div", { role: "status", "aria-live": "polite", style: { background: '#fff', borderRadius: 8, padding: 10, marginTop: 10, fontSize: 13 }, children: [_jsx("strong", { children: `${classNameFor(sameSubjectAssignments.find((a) => a.id === copyProgress.assignmentId)?.classId)} — الفصل ${copyProgress.assignmentIndex} من ${copyProgress.totalAssignments}` }), _jsx("div", { style: { marginTop: 6 }, children: copyProgress.phase === 'skills' ? `تجهيز المهارات: ${copyProgress.completedSkills} من ${copyProgress.totalSkills}` : copyProgress.phase === 'assessments' ? `سجلات الرصد المحفوظة: ${copyProgress.completedAssessments} من ${copyProgress.totalAssessments}` : copyProgress.phase === 'summary' ? 'جار تحديث ملخص الأسبوع' : copyProgress.phase === 'complete' ? 'اكتمل نسخ هذا الفصل' : 'جار تجهيز النسخ' }), copyProgress.totalAssessments > 0 && _jsx("progress", { max: copyProgress.totalAssessments, value: copyProgress.completedAssessments || 0, "aria-label": "تقدم حفظ الرصد", style: { width: '100%', marginTop: 8, accentColor: colors.primary } }), copyElapsed >= 20 && _jsx("div", { style: { color: colors.textMuted, fontSize: 12, marginTop: 6 }, children: `النسخ مستمر؛ المدة حتى الآن ${copyElapsed} ثانية.` })] })] }), copyResults && _jsx("div", { style: { marginTop: 10, fontSize: 12 }, children: copyResults.map((r) => { const a = sameSubjectAssignments.find((x) => x.id === r.assignmentId); return _jsxs("div", { style: { color: r.ok ? '#0b5c33' : colors.red }, children: [classNameFor(a?.classId), ": ", r.ok ? 'تم النسخ بنجاح' : r.error] }, r.assignmentId); }) })] }), _jsxs("h3", { style: { fontFamily: font.family, marginBottom: 8 }, children: ["\u0627\u0644\u0623\u0633\u0627\u0628\u064a\u0639 \u0627\u0644\u062f\u0631\u0627\u0633\u064a\u0629 (", weeks.length, ")"] }), weeks.length === 0 ? _jsx("p", { style: { color: colors.textMuted }, children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0633\u0627\u0628\u064A\u0639 \u0628\u0639\u062F." }) : weeks.map(w => _jsx("div", { style: { border: `1px solid ${colors.border}`, borderRadius: radius.button, marginBottom: 8, padding: spacing.md }, children: _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, children: [_jsxs("button", { onClick: () => setSelectedWeekId(w.id), disabled: copying, style: { background: 'none', border: 'none', color: colors.ink, fontWeight: 'bold', fontSize: 15, textAlign: 'right' }, children: [w.name, " ", _jsx("span", { style: { fontSize: 11, padding: '2px 7px', borderRadius: 999, background: w.type === 'remediation' ? colors.amberTint : colors.primaryTint, color: w.type === 'remediation' ? colors.amber : '#0b5c33' }, children: weekTypeLabel(w) })] }), _jsx("button", { onClick: () => handleDelete(w), disabled: copying || deletingId === w.id, style: { padding: '5px 10px', background: colors.redTint, border: `1px solid ${colors.redBorder}`, borderRadius: 6, fontSize: 11, color: colors.red }, children: deletingId === w.id ? 'جارٍ الحذف...' : 'حذف' })] }) }, w.id))] });
}
