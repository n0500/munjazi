import React, { useEffect, useState } from 'react';
import { PDFViewer, PDFDownloadLink, pdf } from '@react-pdf/renderer';
import { buildClassWeekReportData } from '../lib/reportsApi.js';
import AllClassesTrackingReportDocument from './AllClassesTrackingReportDocument.jsx';
import { colors } from '../lib/theme.js';

export default function DirectWeekReport({ schoolId, target, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [fullViewBusy, setFullViewBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setData(null); setError('');
    buildClassWeekReportData(schoolId, {
      classId: target.classId, teacherUid: target.teacherUid,
      assignmentId: target.assignmentId, className: target.className,
      subject: target.subject || '', teacherName: target.teacherName || '',
      weekId: target.weekId, weekName: target.weekName,
      weekTypeLabel: target.weekType === 'remediation' ? 'معالجة' : 'قياس',
    }).then(result => { if (active) setData(result); })
      .catch(err => { if (active) setError(err.message || 'تعذّر فتح التقرير.'); });
    return () => { active = false; };
  }, [schoolId, target]);
  async function openFullReport() {
    if (!data || fullViewBusy) return;
    // Open the tab synchronously in the user gesture to avoid mobile popup blocking.
    const tab = window.open('', '_blank');
    if (!tab) { setError('تعذّر فتح نافذة التقرير. اسمحي بالنوافذ المنبثقة أو استخدمي تحميل PDF.'); return; }
    setFullViewBusy(true); setError('');
    try {
      const blob = await pdf(<AllClassesTrackingReportDocument reports={[data]} />).toBlob();
      const url = URL.createObjectURL(blob);
      tab.location.replace(url);
      // Keep the blob URL alive while the new tab is loading and being viewed.
      setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
    } catch (err) {
      tab.close(); setError(err.message || 'تعذّر فتح التقرير الكامل.');
    } finally { setFullViewBusy(false); }
  }
  const document = data ? <AllClassesTrackingReportDocument reports={[data]} /> : null;
  return <main dir="rtl" style={{ maxWidth: 1000, margin: '16px auto', padding: 12 }}>
    <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
      <button type="button" onClick={onBack} style={{ padding: 10, border: '1px solid #b6c9bf', borderRadius: 7, background: '#fff', color: colors.primary }}>العودة إلى المتابعة</button>
      <strong>تقرير {target.weekName} — {target.className}</strong>
      {data && <button type="button" onClick={openFullReport} disabled={fullViewBusy} style={{ padding: 10, borderRadius: 7, border: '1px solid #b6c9bf', background: '#eaf5ed', color: colors.primary, cursor: 'pointer' }}>{fullViewBusy ? 'جارٍ فتح الصفحات…' : 'عرض جميع الصفحات'}</button>}
      {data && <PDFDownloadLink document={document} fileName={`تقرير-${target.weekName}-${target.className}.pdf`} style={{ padding: 10, borderRadius: 7, background: colors.primary, color: '#fff', textDecoration: 'none' }}>{({loading}) => loading ? 'جارٍ إعداد PDF…' : 'تحميل PDF'}</PDFDownloadLink>}
    </div>
    {error && <p role="alert" style={{ color: '#a22' }}>{error}</p>}
    {!data && !error && <p>جارٍ تحميل التقرير المحدد…</p>}
    {data && <p style={{ fontSize: 13, color: colors.textMuted }}>إذا عرض متصفح الجوال صفحة واحدة فقط، اضغطي «عرض جميع الصفحات» لفتح ملف التقرير الكامل في عارض الجهاز، أو حمّلي PDF.</p>}
    {data && <PDFViewer showToolbar={true} style={{ width: '100%', height: 'min(82vh, 900px)', border: '1px solid #dce5de', borderRadius: 8 }}>{document}</PDFViewer>}
  </main>;
}
