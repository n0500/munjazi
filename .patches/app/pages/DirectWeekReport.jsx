import React, { useEffect, useRef, useState } from 'react';
import { PDFDownloadLink, pdf } from '@react-pdf/renderer';
import { buildClassWeekReportData } from '../lib/reportsApi.js';
import AllClassesTrackingReportDocument from './AllClassesTrackingReportDocument.jsx';
import { colors } from '../lib/theme.js';

export default function DirectWeekReport({ schoolId, target, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const pagesRef = useRef(null);
  const [pageStatus, setPageStatus] = useState('');
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
  useEffect(() => {
    if (!data || !pagesRef.current) return;
    let cancelled = false;
    const root = pagesRef.current;
    root.replaceChildren();
    setPageStatus('جارٍ عرض جميع صفحات التقرير…');
    (async () => {
      try {
        const reportBlob = await pdf(<AllClassesTrackingReportDocument reports={[data]} />).toBlob();
        const pdfjs = await import(/* @vite-ignore */ 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
        const bytes = await reportBlob.arrayBuffer();
        const pdfDocument = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        for (let number = 1; number <= pdfDocument.numPages; number++) {
          if (cancelled) break;
          const page = await pdfDocument.getPage(number);
          const viewport = page.getViewport({ scale: 1 });
          const availableWidth = Math.max(280, Math.min(root.clientWidth - 16, 920));
          const scale = Math.min(2, availableWidth / viewport.width);
          const display = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          const ratio = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.ceil(display.width * ratio);
          canvas.height = Math.ceil(display.height * ratio);
          canvas.style.width = '100%';
          canvas.style.maxWidth = display.width + 'px';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
          canvas.style.margin = '0 auto';
          canvas.style.background = '#fff';
          const ctx = canvas.getContext('2d');
          const renderViewport = page.getViewport({ scale: scale * ratio });
          await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
          if (cancelled) break;
          const wrapper = document.createElement('section');
          wrapper.style.cssText = 'margin-bottom:16px;text-align:center';
          const heading = document.createElement('div');
          heading.textContent = 'صفحة ' + number + ' من ' + pdfDocument.numPages;
          heading.style.cssText = 'font-size:13px;color:#52695c;margin-bottom:8px';
          wrapper.append(heading, canvas);
          root.append(wrapper);
          setPageStatus('جارٍ عرض الصفحة ' + number + ' من ' + pdfDocument.numPages);
        }
        if (!cancelled) setPageStatus('اكتمل عرض ' + pdfDocument.numPages + ' صفحات');
      } catch (err) {
        if (!cancelled) setPageStatus('تعذّر عرض صفحات التقرير داخل التطبيق. يمكنك استخدام تحميل PDF. ' + (err.message || ''));
      }
    })();
    return () => { cancelled = true; };
  }, [data]);
  const document = data ? <AllClassesTrackingReportDocument reports={[data]} /> : null;
  return <main dir="rtl" style={{ maxWidth: 1000, margin: '16px auto', padding: 12 }}>
    <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
      <button type="button" onClick={onBack} style={{ padding: 10, border: '1px solid #b6c9bf', borderRadius: 7, background: '#fff', color: colors.primary }}>العودة إلى المتابعة</button>
      <strong>تقرير {target.weekName} — {target.className}</strong>
      {data && <PDFDownloadLink document={document} fileName={`تقرير-${target.weekName}-${target.className}.pdf`} style={{ padding: 10, borderRadius: 7, background: colors.primary, color: '#fff', textDecoration: 'none' }}>{({loading}) => loading ? 'جارٍ إعداد PDF…' : 'تحميل PDF'}</PDFDownloadLink>}
    </div>
    {error && <p role="alert" style={{ color: '#a22' }}>{error}</p>}
    {!data && !error && <p>جارٍ تحميل التقرير المحدد…</p>}
    {data && <p role="status" style={{ fontSize: 13, color: colors.textMuted }}>{pageStatus}</p>}
    {data && <div ref={pagesRef} style={{ width: '100%', boxSizing: 'border-box', padding: 8, background: '#f2f5f3', border: '1px solid #dce5de', borderRadius: 8 }} />}
  </main>;
}
