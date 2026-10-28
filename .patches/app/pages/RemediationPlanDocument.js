import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Document, Page, Text, View, StyleSheet, Font, Link } from '@react-pdf/renderer';
import ReportLogo from '../components/ReportLogo.js';
Font.register({
    family: 'Plex',
    src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Regular.ttf',
});
Font.register({
    family: 'Plex-Bold',
    src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Bold.ttf',
});
Font.registerHyphenationCallback((word) => [word]);
const STATUS_TEXT = { active: 'نشطة', closedSuccess: 'أُغلقت — تحقق الإتقان', closedPartial: 'أُغلقت — تحسن جزئي', closedFailure: 'أُغلقت — دون تحسن' };
const styles = StyleSheet.create({
    page: { fontFamily: 'Plex', paddingTop: 100, paddingBottom: 40, paddingHorizontal: 30, fontSize: 10 },
    fixedHeaderBlock: { position: 'absolute', top: 16, left: 30, right: 30 },
    reportLogo: { position: 'absolute', top: 0, right: 0, width: 62, height: 28, objectFit: 'contain' },
    schoolName: { fontFamily: 'Plex-Bold', fontSize: 13, color: '#14261e', textAlign: 'center', lineHeight: 1.3 },
    metaLine: { fontSize: 9, color: '#555', textAlign: 'center', marginTop: 3, lineHeight: 1.3 },
    reportTitle: { fontFamily: 'Plex-Bold', fontSize: 15, color: '#0b7a4b', textAlign: 'center', marginTop: 8 },
    infoLine: { fontSize: 10, marginBottom: 6, lineHeight: 1.4, textAlign: 'right' },
    infoLabel: { fontFamily: 'Plex-Bold' },
    linkLine: { fontSize: 9, marginBottom: 10 },
    linkText: { color: '#0b7a4b', textDecoration: 'underline' },
    statusBadge: {
        alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5,
        borderWidth: 1, marginBottom: 10,
    },
    statusBadgeText: { fontSize: 9, fontFamily: 'Plex-Bold' },
    sectionTitle: { fontFamily: 'Plex-Bold', fontSize: 12, color: '#0b7a4b', marginTop: 14, marginBottom: 8, textAlign: 'right' },
    noFollowUps: { fontSize: 9.5, color: '#999' },
    followUpItem: { borderBottomWidth: 0.75, borderBottomColor: '#eee', paddingVertical: 6 },
    followUpDate: { fontSize: 8.5, color: '#999', marginBottom: 2 },
    followUpText: { fontSize: 9.5 },
    footer: {
        position: 'absolute', bottom: 16, left: 30, right: 30,
        flexDirection: 'row-reverse', justifyContent: 'space-between',
        fontSize: 8, color: '#333', borderTop: 0.5, borderTopColor: '#ccc', paddingTop: 6,
    },
});
const STATUS_STYLE = {
    active: { bg: '#eaf6ee', text: '#0b5c33', border: '#0b7a4b' },
    closedSuccess: { bg: '#eaf6ee', text: '#0b5c33', border: '#0b7a4b' },
    closedPartial: { bg: '#fff4df', text: '#805100', border: '#d4a531' },
    closedFailure: { bg: '#fdecea', text: '#a10000', border: '#c62828' },
};
function formatDate(value) {
    if (!value)
        return '—';
    try {
        return new Date(value).toLocaleDateString('ar-SA');
    }
    catch {
        return '—';
    }
}
export default function RemediationPlanDocument({ plan, followUps, schoolName, principalName, teacherName, className, subject }) {
    const statusStyle = STATUS_STYLE[plan.status] || STATUS_STYLE.active;
    const startDateValue = plan.startDate?.toDate ? plan.startDate.toDate() : plan.startDate;
    return (_jsx(Document, { children: _jsxs(Page, { size: "A4", style: styles.page, children: [_jsxs(View, { style: styles.fixedHeaderBlock, fixed: true, children: [_jsx(ReportLogo, { style: styles.reportLogo }), _jsx(Text, { style: styles.schoolName, children: schoolName }), _jsxs(Text, { style: styles.metaLine, children: ["\u0627\u0644\u0645\u0627\u062F\u0629: ", subject || 'غير محددة'] }), _jsx(Text, { style: styles.reportTitle, children: "\u062E\u0637\u0629 \u0639\u0644\u0627\u062C\u064A\u0629" })] }), _jsxs(Text, { style: styles.infoLine, children: [_jsx(Text, { style: styles.infoLabel, children: "\u0627\u0644\u0637\u0627\u0644\u0628\u0629: " }), plan.studentName] }), _jsxs(Text, { style: styles.infoLine, children: [_jsx(Text, { style: styles.infoLabel, children: "\u0627\u0644\u0641\u0635\u0644: " }), className] }), _jsxs(Text, { style: styles.infoLine, children: [_jsx(Text, { style: styles.infoLabel, children: "\u0627\u0644\u0645\u0647\u0627\u0631\u0629 \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641\u0629: " }), plan.skillTitle] }), _jsx(View, { style: [styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }], children: _jsx(Text, { style: [styles.statusBadgeText, { color: statusStyle.text }], children: STATUS_TEXT[plan.status] }) }), plan.action && (_jsxs(Text, { style: styles.infoLine, children: [_jsx(Text, { style: styles.infoLabel, children: "\u0627\u0644\u0625\u062C\u0631\u0627\u0621: " }), plan.action] })), plan.enrichmentLink && (_jsxs(Text, { style: styles.linkLine, children: ["\u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0625\u062B\u0631\u0627\u0626\u064A: ", _jsx(Link, { src: plan.enrichmentLink, style: styles.linkText, children: plan.enrichmentLink })] })), _jsxs(Text, { style: styles.infoLine, children: ["\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0628\u062F\u0627\u064A\u0629: ", formatDate(startDateValue), " \u2014 \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0645\u062A\u0648\u0642\u0651\u0639: ", formatDate(plan.reviewDate)] }), _jsx(Text, { style: styles.infoLine, children: plan.impactEvidence ? `أثر المعالجة: قبل ${plan.impactEvidence.baseline} ← بعد ${plan.impactEvidence.after} | ${plan.impactEvidence.measurements?.map(m=>m.weekName).join("، ") || "قياس لاحق"}` : "لا يوجد قياس لاحق مرتبط بالخطة" }), _jsx(Text, { style: styles.sectionTitle, children: "\u0633\u062C\u0644 \u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629" }), followUps.length === 0 ? (_jsx(Text, { style: styles.noFollowUps, children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u062A\u0627\u0628\u0639\u0627\u062A \u0645\u0633\u062C\u064E\u0651\u0644\u0629 \u062D\u062A\u0649 \u0627\u0644\u0622\u0646." })) : (followUps.map((f) => {
                    const dateValue = f.createdAt?.toDate ? f.createdAt.toDate() : f.createdAt;
                    return (_jsxs(View, { style: styles.followUpItem, wrap: false, children: [_jsx(Text, { style: styles.followUpDate, children: formatDate(dateValue) }), _jsx(Text, { style: styles.followUpText, children: f.text })] }, f.id));
                })), _jsxs(View, { style: styles.footer, fixed: true, children: [_jsxs(Text, { children: ["\u0645\u062F\u064A\u0631\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u0629: ", principalName || '—'] }), _jsxs(Text, { children: ["\u0627\u0644\u0645\u0639\u0644\u0651\u0645\u0629: ", teacherName] }), _jsx(Text, { render: ({ pageNumber, totalPages }) => `صادر من منجزي — صفحة ${pageNumber} من ${totalPages}` })] })] }) }));
}
