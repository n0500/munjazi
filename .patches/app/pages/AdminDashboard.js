import DirectWeekReport from './DirectWeekReport.jsx';
import TeacherCumulativeTracking from '../components/TeacherCumulativeTracking.jsx';
import AdminNotes from '../components/AdminNotes.jsx';
import ReportNoteComposer from '../components/ReportNoteComposer.jsx';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Suspense, lazy, useEffect, useState } from 'react';
import { getSchool } from '../lib/schoolsApi.js';
import { listClasses, createClass, updateClassName, deleteClassIfEmpty, setClassArchived, linkTeacherToClass, listClassAssignments, removeAssignment, } from '../lib/classesApi.js';
import { listSchoolTeachers } from '../lib/teachersApi.js';
import { listClassStudents } from '../lib/studentsApi.js';
import { getLatestWeekSummaryLight } from '../lib/overviewApi.js';
import { listActionsForClass } from '../lib/actionEngine.js';
import { dedupeAssignmentsForDisplay, actionBelongsToAssignment } from '../lib/dataLogic.js';
import ClassDetail from './ClassDetail.js';
import { colors, font, radius, spacing } from '../lib/theme.js';
const ClassReport = lazy(() => import('./ClassReport.js'));
const ParentReviewTracking = lazy(() => import('./ParentReviewTracking.js'));
const AdminTracking = lazy(() => import('./AdminTracking.js'));
const AdminImpactReport = lazy(() => import('./AdminImpactReport.jsx'));
const AdminSafety = lazy(() => import('./AdminSafety.js'));
function SectionLoading() { return _jsx("p", { style: { textAlign: 'center', marginTop: 24, color: colors.textMuted }, children: "جارٍ فتح القسم..." }); }
const TABS = [
    { key: 'overview', label: 'نظرة عامة' },
    { key: 'classes', label: 'الفصول والطالبات' },
    { key: 'teachers', label: 'المعلمات' },
    { key: 'notes', label: 'ملاحظات الإدارة' },
    { key: 'tracking', label: 'متابعة الرصد' },
    { key: 'trackingPreview', label: 'متابعة المعلمات' },
    { key: 'impact', label: 'الأثر العام' },
    { key: 'pendingAck', label: 'اطلاع أولياء الأمور' },
    { key: 'safety', label: 'النسخ والسلامة' },
];
function daysSince(timestamp) {
    if (!timestamp?.seconds)
        return null;
    const ms = Date.now() - timestamp.seconds * 1000;
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
function formatDaysAgo(days) {
    if (days === null)
        return '—';
    if (days === 0)
        return 'اليوم';
    if (days === 1)
        return 'منذ يوم واحد';
    if (days === 2)
        return 'منذ يومين';
    if (days <= 10)
        return `منذ ${days} أيام`;
    return `منذ ${days} يومًا`;
}
function formatDate(value) {
    if (!value)
        return '—';
    try {
        const date = value.toDate ? value.toDate() : new Date(value);
        return date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
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
export default function AdminDashboard({ schoolId }) {
    const [activeTab, setActiveTab] = useState('overview');
    const [school, setSchool] = useState(null);
    const [classes, setClasses] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [studentCounts, setStudentCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [linkCopied, setLinkCopied] = useState(false);
    const [className, setClassName] = useState('');
    const [creating, setCreating] = useState(false);
    const [selectedClassId, setSelectedClassId] = useState(null);
    const [assignExpandedId, setAssignExpandedId] = useState(null);
    const [assignmentsByClass, setAssignmentsByClass] = useState({});
    const [assignTeacherUid, setAssignTeacherUid] = useState('');
    const [assignSubject, setAssignSubject] = useState('');
    const [assigning, setAssigning] = useState(false);
    const [editingClassId, setEditingClassId] = useState(null);
    const [editClassNameValue, setEditClassNameValue] = useState('');
    const [savingClassName, setSavingClassName] = useState(false);
    const [deletingClassId, setDeletingClassId] = useState(null);
    const [trackingRows, setTrackingRows] = useState(null);
    const [trackingLoading, setTrackingLoading] = useState(false);
    const [trackingTypeFilter, setTrackingTypeFilter] = useState('all');
    const [trackingStatusFilter, setTrackingStatusFilter] = useState('all');
    const [trackingExporting, setTrackingExporting] = useState(false);
    const [reportTarget, setReportTarget] = useState(null);
    const [pendingAckScope, setPendingAckScope] = useState('all');
    const [pendingAckGenerating, setPendingAckGenerating] = useState(false);
    const [backupGenerating, setBackupGenerating] = useState(false);
    const [backupSuccessMsg, setBackupSuccessMsg] = useState('');
    const [backupRestoring, setBackupRestoring] = useState(false);
    const classNameFor = (classId) => classes.find((c) => c.id === classId)?.name || '؟';
    async function refresh() {
        setLoading(true);
        setError('');
        try {
            const [schoolRow, classRows, teacherRows] = await Promise.all([
                getSchool(schoolId),
                listClasses(schoolId),
                listSchoolTeachers(schoolId),
            ]);
            setSchool(schoolRow);
            setClasses(classRows);
            setTeachers(teacherRows);
            const countsEntries = await Promise.all(classRows.map(async (c) => {
                const students = await listClassStudents(schoolId, c.id);
                return [c.id, students.length];
            }));
            setStudentCounts(Object.fromEntries(countsEntries));
            const assignmentLists = await Promise.all(classRows.map((c) => listClassAssignments(schoolId, c.id, { includeInactive: true })));
            const grouped = dedupeAssignmentsForDisplay(assignmentLists.flat());
            setAssignments(grouped);
            setAssignmentsByClass((prev) => {
                const next = { ...prev };
                classRows.forEach((c) => {
                    const classRowsGrouped = grouped.filter((a) => a.classId === c.id);
                    if (prev[c.id])
                        next[c.id] = classRowsGrouped;
                });
                return next;
            });
        }
        catch (err) {
            setError(err.message || 'تعذّر تحميل بيانات المدرسة.');
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schoolId]);
    async function loadTracking() {
        setTrackingLoading(true);
        setError('');
        try {
            const rows = await Promise.all(assignments.map(async (a) => {
                const [summary, classActions, allClassAssignments] = await Promise.all([
                    getLatestWeekSummaryLight(schoolId, a.classId, a.teacherUid, a.id),
                    listActionsForClass(schoolId, a.classId),
                    listClassAssignments(schoolId, a.classId, { includeInactive: true }),
                ]);
                const daysAgo = summary ? daysSince(summary.createdAt) : null;
                let masteryPercent = null;
                if (summary) {
                    const total = Object.values(summary.counts).reduce((sum, n) => sum + n, 0);
                    if (total > 0)
                        masteryPercent = Math.round((summary.counts.mastered / total) * 100);
                }
                const activeActionsCount = classActions.filter((act) => act.status === 'active' && actionBelongsToAssignment(act, a, allClassAssignments)).length;
                return {
                    assignmentId: a.id,
                    classId: a.classId,
                    className: classNameFor(a.classId),
                    teacherUid: a.teacherUid,
                    teacherName: a.teacherName,
                    subject: a.subject || 'بدون مادة',
                    weekId: summary?.weekId || null,
                    weekName: summary?.weekName || null,
                    weekType: summary?.weekType || null,
                    weekTypeLabel: summary?.weekType === 'remediation' ? 'معالجة' : summary?.weekType === 'measurement' ? 'قياس' : '—',
                    daysAgo,
                    masteryPercent,
                    activeActionsCount,
                    completionPercent: summary?.completionPercent ?? 0,
                    recordedCells: summary?.recordedCells ?? 0,
                    totalCells: summary?.totalCells ?? 0,
                    lastUpdatedAt: summary?.createdAt || null,
                };
            }));
            rows.sort((a, b) => {
                const aStale = a.daysAgo === null ? 9999 : a.daysAgo;
                const bStale = b.daysAgo === null ? 9999 : b.daysAgo;
                if (aStale !== bStale)
                    return bStale - aStale;
                const aMastery = a.masteryPercent === null ? -1 : a.masteryPercent;
                const bMastery = b.masteryPercent === null ? -1 : b.masteryPercent;
                return aMastery - bMastery;
            });
            setTrackingRows(rows);
        }
        catch (err) {
            setError(err.message || 'تعذّر تحميل بيانات المتابعة.');
        }
        finally {
            setTrackingLoading(false);
        }
    }
    function trackingRowsForView() {
        let rows = trackingRows || [];
        if (trackingTypeFilter !== 'all') rows = rows.filter((r) => r.weekType === trackingTypeFilter);
        if (trackingStatusFilter !== 'all') rows = rows.filter((r) => {
            const status = trackingStatusFor(r);
            return trackingStatusFilter === 'notStarted' ? status === 'لم يبدأ' : trackingStatusFilter === 'inProgress' ? status === 'جاري الرصد' : status === 'مكتمل';
        });
        return rows;
    }
    function trackingStatusFor(row) {
        if (!row.weekName || row.completionPercent === 0) return 'لم يبدأ';
        if (row.completionPercent >= 100) return 'مكتمل';
        return 'جاري الرصد';
    }
    async function handleExportTrackingPdf() {
        setTrackingExporting(true);
        setError('');
        try {
            const rows = trackingRowsForView().map((r) => ({ ...r, trackingStatus: trackingStatusFor(r) }));
            const filterLabel = trackingTypeFilter === 'measurement' ? 'قياس' : trackingTypeFilter === 'remediation' ? 'معالجة' : 'الكل';
            const generatedDate = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
            const [{ pdf }, { default: TrackingReportDocument }] = await Promise.all([import('@react-pdf/renderer'), import('./TrackingReportDocument.js')]);
            const blob = await pdf(_jsx(TrackingReportDocument, { schoolName: school?.name || '', rows: rows, filterLabel: filterLabel, generatedDate: generatedDate })).toBlob();
            await downloadBlob(blob, `متابعة-الرصد-${filterLabel}.pdf`);
        }
        catch (err) {
            setError(err.message || 'تعذّر تصدير تقرير متابعة الرصد.');
        }
        finally {
            setTrackingExporting(false);
        }
    }
    async function handleExportTrackingExcel() {
        try {
            const XLSX = await import('xlsx');
            const rows = trackingRowsForView().map((r) => ({
                'الفصل': r.className,
                'المعلمة': r.teacherName,
                'المادة': r.subject,
                'نوع التقرير': r.weekTypeLabel,
                'آخر رصد': r.weekName || 'لم يبدأ الرصد',
                'اكتمال الرصد': `${r.completionPercent || 0}%`,
                'نسبة المتقنات': r.masteryPercent === null ? '' : `${r.masteryPercent}%`,
                'آخر تحديث': formatDate(r.lastUpdatedAt),
                'إجراءات نشطة': r.activeActionsCount || 0,
                'حالة المتابعة': trackingStatusFor(r),
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'متابعة الرصد');
            const filterLabel = trackingTypeFilter === 'measurement' ? 'قياس' : trackingTypeFilter === 'remediation' ? 'معالجة' : 'الكل';
            XLSX.writeFile(wb, `متابعة-الرصد-${filterLabel}.xlsx`);
        }
        catch (err) {
            setError(err.message || 'تعذّر تصدير ملف Excel.');
        }
    }
    async function handleCreateClass(e) {
        e.preventDefault();
        setError('');
        if (!className.trim() || creating)
            return;
        setCreating(true);
        try {
            await createClass(schoolId, className);
            setClassName('');
            await refresh();
        }
        catch (err) {
            setError(err.message || 'تعذّر إنشاء الفصل.');
        }
        finally {
            setCreating(false);
        }
    }
    async function handleToggleClass(cls) {
        setError('');
        try {
            await setClassArchived(schoolId, cls.id, !cls.archived);
            await refresh();
        }
        catch (err) {
            setError(err.message || 'تعذّر تحديث حالة الفصل.');
        }
    }
    function startEditClassName(cls) {
        setEditingClassId(cls.id);
        setEditClassNameValue(cls.name);
    }
    async function handleSaveClassName(classId) {
        setError('');
        setSavingClassName(true);
        try {
            await updateClassName(schoolId, classId, editClassNameValue);
            setEditingClassId(null);
            await refresh();
        }
        catch (err) {
            setError(err.message || 'تعذّر تعديل اسم الفصل.');
        }
        finally {
            setSavingClassName(false);
        }
    }
    async function handleDeleteClass(cls) {
        if (!window.confirm(`سيتم حذف الفصل "${cls.name}" نهائيًا، ولا يمكن التراجع عن هذا الإجراء. هل الرغبة في المتابعة مؤكدة؟`))
            return;
        setError('');
        setDeletingClassId(cls.id);
        try {
            await deleteClassIfEmpty(schoolId, cls.id);
            await refresh();
        }
        catch (err) {
            setError(err.message || 'تعذّر حذف الفصل.');
        }
        finally {
            setDeletingClassId(null);
        }
    }
    async function toggleAssignExpand(classId) {
        if (assignExpandedId === classId) {
            setAssignExpandedId(null);
            return;
        }
        setAssignExpandedId(classId);
        setAssignTeacherUid('');
        setAssignSubject('');
        try {
            const rows = await listClassAssignments(schoolId, classId, { includeInactive: true });
            setAssignmentsByClass((prev) => ({ ...prev, [classId]: dedupeAssignmentsForDisplay(rows) }));
        }
        catch (err) {
            setError(err.message || 'تعذّر تحميل الإسنادات.');
        }
    }
    async function handleAssign(classId) {
        setError('');
        if (!assignTeacherUid || !assignSubject.trim() || assigning)
            return;
        setAssigning(true);
        try {
            const teacher = teachers.find((t) => t.uid === assignTeacherUid);
            await linkTeacherToClass(schoolId, classId, assignTeacherUid, teacher?.displayName, assignSubject);
            setAssignTeacherUid('');
            setAssignSubject('');
            const rows = await listClassAssignments(schoolId, classId, { includeInactive: true });
            setAssignmentsByClass((prev) => ({ ...prev, [classId]: dedupeAssignmentsForDisplay(rows) }));
            setTrackingRows(null);
            await refresh();
        }
        catch (err) {
            setError(err.message || 'تعذّر إسناد المعلّمة.');
        }
        finally {
            setAssigning(false);
        }
    }
    async function handleRemoveAssignment(classId, assignment) {
        setError('');
        try {
            for (const id of (assignment.assignmentIds || [assignment.id])) {
                // eslint-disable-next-line no-await-in-loop
                await removeAssignment(schoolId, id);
            }
            const rows = await listClassAssignments(schoolId, classId, { includeInactive: true });
            setAssignmentsByClass((prev) => ({ ...prev, [classId]: dedupeAssignmentsForDisplay(rows) }));
            setTrackingRows(null);
            await refresh();
        }
        catch (err) {
            setError(err.message || 'تعذر إزالة الإسناد.');
        }
    }
    function handleCopyParentLink() {
        const link = `${window.location.origin}${window.location.pathname}?role=parent`;
        navigator.clipboard.writeText(link);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 3000);
    }
    function assignedClassesCountFor(teacherUid) {
        return assignments.filter((a) => a.teacherUid === teacherUid).length;
    }
    function classAssignmentsCountFor(classId) {
        return assignments.filter((a) => a.classId === classId).length;
    }
    function assignmentForAction(action, allClassAssignments) {
        const classGroups = assignments.filter((a) => a.classId === action.classId && a.teacherUid === action.teacherUid);
        const exact = classGroups.find((a) => action.assignmentId && (a.assignmentIds || [a.id]).includes(action.assignmentId));
        if (exact)
            return exact;
        const compatible = classGroups.filter((group) => actionBelongsToAssignment(action, group, allClassAssignments));
        return compatible.length === 1 ? compatible[0] : null;
    }
    async function handleGeneratePendingAckReport() {
        setError('');
        setPendingAckGenerating(true);
        try {
            const targetClassIds = pendingAckScope === 'all'
                ? [...new Set(assignments.map((a) => a.classId))]
                : [pendingAckScope];
            const [actionsPerClass, assignmentRowsPerClass] = await Promise.all([
                Promise.all(targetClassIds.map((classId) => listActionsForClass(schoolId, classId))),
                Promise.all(targetClassIds.map((classId) => listClassAssignments(schoolId, classId, { includeInactive: true }))),
            ]);
            const allAssignmentsByClass = Object.fromEntries(targetClassIds.map((classId, index) => [classId, assignmentRowsPerClass[index]]));
            const pendingRemedial = actionsPerClass.flat().filter((a) => a.type === 'remedial' && a.status === 'active' && !a.parentAcknowledgment?.viewedAt);
            const rows = pendingRemedial.map((a) => {
                const assignment = assignmentForAction(a, allAssignmentsByClass[a.classId] || []);
                return {
                    studentName: a.studentName,
                    teacherName: assignment?.teacherName || teachers.find((t) => t.uid === a.teacherUid)?.displayName || '؟',
                    subject: assignment?.subject || 'مادة غير محددة (سجل قديم)',
                    className: classNameFor(a.classId),
                    skillTitles: (a.affectedSkillTitles || []).join('، '),
                    activatedDate: formatDate(a.activatedAt),
                    repeated: (a.followUpLog?.length || 0) > 0,
                };
            });
            rows.sort((a, b) => (b.repeated === a.repeated ? 0 : b.repeated ? 1 : -1));
            const scopeLabel = pendingAckScope === 'all' ? 'المدرسة بالكامل' : `فصل: ${classNameFor(pendingAckScope)}`;
            const generatedDate = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
            const [{ pdf }, { default: PendingAckReportDocument }] = await Promise.all([import('@react-pdf/renderer'), import('./PendingAckReportDocument.js')]);
            const blob = await pdf(_jsx(PendingAckReportDocument, { rows: rows, schoolName: school?.name || '', scopeLabel: scopeLabel, generatedDate: generatedDate })).toBlob();
            await downloadBlob(blob, `تقرير-اطلاع-أولياء-الأمور-${pendingAckScope === 'all' ? 'كامل-المدرسة' : classNameFor(pendingAckScope)}.pdf`);
        }
        catch (err) {
            setError(err.message || 'تعذّر توليد التقرير.');
        }
        finally {
            setPendingAckGenerating(false);
        }
    }
    async function handleGenerateBackup() {
        setError('');
        setBackupSuccessMsg('');
        setBackupGenerating(true);
        try {
            const { exportSchoolBackupAsExcelBlob, downloadBlobAsFile } = await import('../lib/backupApi.js');
            const blob = await exportSchoolBackupAsExcelBlob(schoolId);
            const dateStr = new Date().toISOString().slice(0, 10);
            downloadBlobAsFile(blob, `نسخة-احتياطية-${school?.name || 'المدرسة'}-${dateStr}.xlsx`);
            setBackupSuccessMsg('تم تصدير النسخة الاحتياطية بنجاح.');
        }
        catch (err) {
            setError(err.message || 'تعذّر تصدير النسخة الاحتياطية.');
        }
        finally {
            setBackupGenerating(false);
        }
    }
    async function handleGenerateJsonBackup() {
        setError(''); setBackupSuccessMsg(''); setBackupGenerating(true);
        try {
            const { exportSchoolBackupAsJsonBlob, downloadBlobAsFile } = await import('../lib/backupApi.js');
            const blob = await exportSchoolBackupAsJsonBlob(schoolId);
            const dateStr = new Date().toISOString().slice(0, 10);
            downloadBlobAsFile(blob, `نسخة-استعادة-${school?.name || 'المدرسة'}-${dateStr}.json`);
            setBackupSuccessMsg('تم تصدير نسخة الاستعادة JSON بنجاح.');
        } catch (err) { setError(err.message || 'تعذّر تصدير نسخة الاستعادة.'); }
        finally { setBackupGenerating(false); }
    }
    async function handleRestoreBackupFile(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        const first = window.confirm('الاستعادة ستستبدل بيانات المدرسة الحالية بما هو موجود في ملف النسخة الاحتياطية. هل تريدين المتابعة؟');
        if (!first) return;
        const second = window.prompt('للتأكيد النهائي اكتبي كلمة: استعادة');
        if ((second || '').trim() !== 'استعادة') return;
        setBackupRestoring(true); setError(''); setBackupSuccessMsg('');
        try {
            const text = await file.text();
            const { restoreSchoolBackup } = await import('../lib/backupApi.js');
            await restoreSchoolBackup(schoolId, text);
            setBackupSuccessMsg('تمت استعادة بيانات Firestore من النسخة بنجاح. ملاحظة: كلمات مرور Firebase Authentication لا تدخل ضمن النسخة.');
            setTrackingRows(null);
            await refresh();
        } catch (err) { setError(err.message || 'تعذّرت استعادة النسخة الاحتياطية.'); }
        finally { setBackupRestoring(false); }
    }
    if (loading)
        return _jsx("p", { style: { textAlign: 'center', marginTop: 60 }, children: "...\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644" });
    if (selectedClassId) {
        return _jsx(ClassDetail, { schoolId: schoolId, classId: selectedClassId, allClasses: classes, onBack: () => { setSelectedClassId(null); refresh(); } });
    }
    if (reportTarget && (activeTab === 'trackingPreview' || reportTarget.direct)) return _jsx(DirectWeekReport, { schoolId: schoolId, target: reportTarget, onBack: () => setReportTarget(null) });
    if (reportTarget) {
        return (_jsxs(_Fragment, { children: [
            activeTab !== 'trackingPreview' && _jsx(ReportNoteComposer, { schoolId: schoolId, reportTarget: reportTarget, teachers: teachers, assignments: assignments, onOpenNotes: () => { setReportTarget(null); setActiveTab('notes'); } }),
            _jsx(Suspense, { fallback: _jsx(SectionLoading, {}), children: _jsx(ClassReport, { schoolId: schoolId, classId: reportTarget.classId, teacherUid: reportTarget.teacherUid, assignmentId: reportTarget.assignmentId, className: reportTarget.className, subject: reportTarget.subject, teacherName: reportTarget.teacherName, defaultWeekId: reportTarget.weekId, defaultWeekName: reportTarget.weekName, onBack: () => setReportTarget(null) }) })
        ] }));
    }
    const activeClasses = classes.filter((c) => !c.archived);
    const archivedClasses = classes.filter((c) => c.archived);
    const totalStudents = Object.values(studentCounts).reduce((sum, n) => sum + n, 0);
    const staleCount = trackingRows ? trackingRows.filter((r) => r.daysAgo === null || r.daysAgo > 7).length : 0;
    const highActionsCount = trackingRows ? trackingRows.filter((r) => r.activeActionsCount > 0).length : 0;
    return (_jsxs("div", { className: "mobile-page-shell", style: { maxWidth: 700, margin: '20px auto', padding: spacing.lg }, dir: "rtl", children: [_jsx("h1", { style: { fontFamily: font.family, color: colors.ink }, children: school?.name || 'لوحة الإدارة' }), _jsx("div", { style: { display: 'flex', gap: 4, overflowX: 'auto', borderBottom: `1px solid ${colors.border}`, marginBottom: spacing.xl }, children: TABS.map((t) => (_jsx("button", { onClick: () => setActiveTab(t.key), style: { padding: '10px 16px', background: 'none', border: 'none', borderBottom: activeTab === t.key ? `2px solid ${colors.primary}` : '2px solid transparent', color: activeTab === t.key ? colors.primary : colors.textMuted, fontFamily: font.family, fontWeight: activeTab === t.key ? font.weightMedium : font.weightRegular, fontSize: 16, whiteSpace: 'nowrap', cursor: 'pointer' }, children: t.label }, t.key))) }), error && _jsx("div", { style: { background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.md }, children: error }), activeTab === 'notes' && _jsx(AdminNotes, { schoolId, teachers, assignments, classes, isAdmin: true, onOpenReport: (target) => setReportTarget(target) }), activeTab === 'overview' && (_jsxs(_Fragment, { children: [_jsxs("p", { style: { color: colors.textMuted }, children: ["\u0631\u0645\u0632 \u0627\u0644\u0645\u062F\u0631\u0633\u0629: ", _jsx("strong", { style: { fontFamily: 'monospace' }, children: school?.schoolCode }), " \u2014 \u064A\u064F\u0631\u062C\u0649 \u062A\u0633\u0644\u064A\u0645\u0647 \u0644\u0644\u0645\u0639\u0644\u0651\u0645\u0627\u062A \u0644\u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628\u0627\u062A\u0647\u0646"] }), _jsxs("div", { style: { marginBottom: spacing.xl }, children: [_jsx("button", { onClick: handleCopyParentLink, style: { padding: '10px 16px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }, children: "\u0646\u0633\u062E \u0631\u0627\u0628\u0637 \u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631" }), linkCopied && _jsx("span", { style: { marginRight: 10, color: '#0b5c33' }, children: "\u062A\u0645 \u0627\u0644\u0646\u0633\u062E \u0628\u0646\u062C\u0627\u062D \u2705" })] }), _jsxs("div", { style: { display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }, children: [_jsxs("div", { style: { flex: '1 1 140px', border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.md, textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: 22, fontWeight: 'bold', color: colors.ink }, children: activeClasses.length }), _jsx("div", { style: { fontSize: 12, color: colors.textMuted }, children: "\u0641\u0635\u0644 \u0646\u0634\u0637" }), archivedClasses.length > 0 && _jsxs("div", { style: { fontSize: 11, color: colors.textMuted }, children: ["(", archivedClasses.length, " \u0645\u0624\u0631\u0634\u0641)"] })] }), _jsxs("div", { style: { flex: '1 1 140px', border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.md, textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: 22, fontWeight: 'bold', color: colors.ink }, children: totalStudents }), _jsx("div", { style: { fontSize: 12, color: colors.textMuted }, children: "\u0637\u0627\u0644\u0628\u0629 \u0625\u062C\u0645\u0627\u0644\u064B\u0627" })] }), _jsxs("div", { style: { flex: '1 1 140px', border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.md, textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: 22, fontWeight: 'bold', color: colors.ink }, children: teachers.length }), _jsx("div", { style: { fontSize: 12, color: colors.textMuted }, children: "\u0645\u0639\u0644\u0651\u0645\u0629 \u0646\u0634\u0637\u0629" })] })] })] })), activeTab === 'classes' && (_jsxs(_Fragment, { children: [_jsxs("div", { style: { border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.xl }, children: [_jsx("h3", { style: { marginTop: 0, fontFamily: font.family }, children: "\u0625\u0636\u0627\u0641\u0629 \u0641\u0635\u0644 \u062C\u062F\u064A\u062F" }), _jsxs("form", { onSubmit: handleCreateClass, style: { display: 'flex', gap: spacing.sm }, children: [_jsx("input", { type: "text", placeholder: "\u0627\u0633\u0645 \u0627\u0644\u0641\u0635\u0644", value: className, onChange: (e) => setClassName(e.target.value), style: { flex: 1, padding: spacing.sm }, required: true }), _jsx("button", { type: "submit", disabled: creating, style: { padding: '10px 16px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }, children: creating ? '...' : 'إضافة' })] })] }), _jsxs("h3", { style: { fontFamily: font.family }, children: ["\u0627\u0644\u0641\u0635\u0648\u0644 (", classes.length, ")"] }), classes.length === 0 ? _jsx("p", { style: { color: colors.textMuted }, children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0641\u0635\u0648\u0644 \u0628\u0639\u062F." }) : classes.map((c) => {
                        const isEmpty = (studentCounts[c.id] || 0) === 0 && classAssignmentsCountFor(c.id) === 0;
                        const isEditing = editingClassId === c.id;
                        return (_jsxs("div", { style: { border: `1px solid ${colors.border}`, borderRadius: radius.button, marginBottom: 10, padding: spacing.md }, children: [isEditing ? (_jsxs("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' }, children: [_jsx("input", { type: "text", value: editClassNameValue, onChange: (e) => setEditClassNameValue(e.target.value), style: { flex: 1, padding: 8, minWidth: 140 }, autoFocus: true }), _jsx("button", { onClick: () => handleSaveClassName(c.id), disabled: savingClassName, style: { padding: '6px 12px', background: colors.primary, color: '#fff', border: 'none', borderRadius: 6 }, children: savingClassName ? '...' : 'حفظ' }), _jsx("button", { onClick: () => setEditingClassId(null), style: { padding: '6px 12px', background: '#f2f2f2', border: 'none', borderRadius: 6 }, children: "\u0625\u0644\u063A\u0627\u0621" })] })) : (_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }, children: [_jsxs("button", { onClick: () => setSelectedClassId(c.id), style: { background: 'none', border: 'none', color: colors.ink, fontWeight: 'bold', fontSize: 16, textAlign: 'right', cursor: 'pointer', fontFamily: font.family }, children: [c.name, " ", c.archived && _jsx("em", { style: { color: colors.red }, children: "(\u0645\u0624\u0631\u0634\u0641)" })] }), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap' }, children: [_jsx("button", { onClick: () => setSelectedClassId(c.id), style: { padding: '6px 12px', background: colors.primary, color: '#fff', border: 'none', borderRadius: 6 }, children: "تحديث الطالبات" }), _jsx("button", { onClick: () => startEditClassName(c), style: { padding: '6px 12px', background: '#f2f2f2', border: 'none', borderRadius: 6 }, children: "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0627\u0633\u0645" }), _jsx("button", { onClick: () => toggleAssignExpand(c.id), style: { padding: '6px 12px', background: '#f2f2f2', border: 'none', borderRadius: 6 }, children: assignExpandedId === c.id ? 'إخفاء المعلّمات' : 'إسناد معلّمة' }), _jsx("button", { onClick: () => handleToggleClass(c), style: { padding: '6px 12px', background: c.archived ? colors.primary : colors.red, color: '#fff', border: 'none', borderRadius: 6 }, children: c.archived ? 'إلغاء الأرشفة' : 'أرشفة' }), isEmpty && _jsx("button", { onClick: () => handleDeleteClass(c), disabled: deletingClassId === c.id, style: { padding: '6px 12px', background: colors.red, color: '#fff', border: 'none', borderRadius: 6 }, children: deletingClassId === c.id ? '...' : 'حذف' })] })] })), !isEditing && assignExpandedId === c.id && (_jsxs("div", { style: { marginTop: spacing.sm, borderTop: `1px solid ${colors.border}`, paddingTop: spacing.sm }, children: [(assignmentsByClass[c.id] || []).map((a) => (_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', padding: '4px 0' }, children: [_jsxs("span", { children: [a.teacherName, " \u2014 ", a.subject || 'بدون مادة'] }), _jsx("button", { onClick: () => handleRemoveAssignment(c.id, a), style: { padding: '2px 8px', background: colors.red, color: '#fff', border: 'none', borderRadius: 6, fontSize: 12 }, children: "\u0625\u0632\u0627\u0644\u0629" })] }, a.id))), _jsxs("div", { style: { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }, children: [_jsxs("select", { value: assignTeacherUid, onChange: (e) => setAssignTeacherUid(e.target.value), style: { flex: 1, padding: 6, minWidth: 140 }, children: [_jsx("option", { value: "", children: "\u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0639\u0644\u0651\u0645\u0629" }), teachers.map((t) => _jsx("option", { value: t.uid, children: t.displayName }, t.uid))] }), _jsx("input", { type: "text", placeholder: "\u0627\u0644\u0645\u0627\u062F\u0629", value: assignSubject, onChange: (e) => setAssignSubject(e.target.value), style: { flex: 1, padding: 6, minWidth: 100 } }), _jsx("button", { onClick: () => handleAssign(c.id), disabled: assigning, style: { padding: '6px 14px', background: colors.primary, color: '#fff', border: 'none', borderRadius: 6 }, children: assigning ? '...' : 'إسناد' })] })] }))] }, c.id));
                    })] })), activeTab === 'teachers' && (_jsxs(_Fragment, { children: [_jsxs("h3", { style: { fontFamily: font.family }, children: ["\u0627\u0644\u0645\u0639\u0644\u0651\u0645\u0627\u062A (", teachers.length, ")"] }), _jsx("p", { style: { color: colors.textMuted, fontSize: 13 }, children: "\u062A\u0639\u0637\u064A\u0644 \u0623\u0648 \u0625\u0639\u0627\u062F\u0629 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0645\u062A\u0627\u062D \u0645\u0646 \u0632\u0631 \u00AB\u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0645\u0639\u0644\u0645\u0627\u062A\u00BB \u0623\u0639\u0644\u0649 \u0627\u0644\u0635\u0641\u062D\u0629." }), teachers.length === 0 ? _jsx("p", { style: { color: colors.textMuted }, children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0639\u0644\u0651\u0645\u0627\u062A \u0646\u0634\u0637\u0627\u062A \u062D\u0627\u0644\u064A\u064B\u0627." }) : teachers.map((t) => {
                        const assignedCount = assignedClassesCountFor(t.uid);
                        return _jsxs("div", { style: { border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.md, marginBottom: 10 }, children: [_jsx("div", { style: { fontWeight: 'bold', fontFamily: font.family }, children: t.displayName }), _jsx("div", { style: { fontSize: 12, color: colors.textMuted, marginTop: 2 }, children: assignedCount > 0 ? `لديها ${assignedCount} إسناد نشط` : 'غير مسندة إلى أي فصل حاليًا' })] }, t.uid);
                    })] })), activeTab === 'trackingPreview' && _jsx(TeacherCumulativeTracking, { schoolId: schoolId, assignments: assignments.map(a => ({ ...a, className: classNameFor(a.classId) })), teachers: teachers, onReport: (target) => setReportTarget(target) }), activeTab === 'tracking' && (_jsx(Suspense, { fallback: _jsx(SectionLoading, {}), children: _jsx(AdminTracking, { schoolId: schoolId, assignments: assignments, classes: classes, schoolName: school?.name || '', onReport: (target) => setReportTarget(target) }) })), activeTab === 'impact' && (_jsx(Suspense, { fallback: _jsx(SectionLoading, {}), children: _jsx(AdminImpactReport, { schoolId: schoolId, assignments: assignments, classes: classes, teachers: teachers }) })), activeTab === 'safety' && (_jsx(Suspense, { fallback: _jsx(SectionLoading, {}), children: _jsx(AdminSafety, { schoolId: schoolId, schoolName: school?.name || '' }) })), activeTab === 'pendingAck' && (_jsxs(_Fragment, { children: [_jsx(Suspense, { fallback: _jsx(SectionLoading, {}), children: _jsx(ParentReviewTracking, { schoolId: schoolId, title: "اطلاع أولياء الأمور على الرصد", adminReportEnabled: true, schoolName: school?.name || "" }) }), _jsx("div", { style: { borderTop: `1px solid ${colors.border}`, margin: `${spacing.xl}px 0 ${spacing.lg}px` } }), _jsx("h3", { style: { fontFamily: font.family, marginBottom: 6 }, children: "تقرير الخطط العلاجية غير المطّلع عليها" }), _jsx("p", { style: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg }, children: "يبقى هذا التقرير مخصصًا للخطط العلاجية النشطة التي لم يطلع عليها ولي الأمر بعد." }), _jsxs("div", { style: { border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.lg }, children: [_jsx("label", { children: "\u0627\u0644\u0646\u0637\u0627\u0642" }), _jsxs("select", { value: pendingAckScope, onChange: (e) => setPendingAckScope(e.target.value), style: { width: '100%', padding: spacing.sm, marginBottom: spacing.md }, children: [_jsx("option", { value: "all", children: "\u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0628\u0627\u0644\u0643\u0627\u0645\u0644" }), classes.map((c) => _jsx("option", { value: c.id, children: c.name }, c.id))] }), _jsx("button", { onClick: handleGeneratePendingAckReport, disabled: pendingAckGenerating, style: { padding: '10px 16px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }, children: pendingAckGenerating ? '...جارٍ التوليد' : 'توليد التقرير وتحميله' })] })] }))] }));
}
