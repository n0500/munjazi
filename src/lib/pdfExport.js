import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// يقتطع منطقة من قماش (canvas) رئيسي ويعيدها كقماش مستقل جاهز للرسم المتكرر
function cropCanvasRegion(sourceCanvas, yPx, heightPx) {
  const region = document.createElement('canvas');
  region.width = sourceCanvas.width;
  region.height = Math.max(1, Math.round(heightPx));
  const ctx = region.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, yPx, sourceCanvas.width, heightPx, 0, 0, sourceCanvas.width, heightPx);
  return region;
}

// يحوّل عنصر HTML إلى PDF متعدد الصفحات، مع:
// - الحفاظ على أي روابط <a href> بداخله قابلة للنقر فعليًا
// - تفادي قطع أي عنصر عليه صنف "pdf-avoid-break" بمنتصف صفحتين
// - تكرار رأس ثابت (عنصر عليه صنف options.repeatHeaderSelector) أعلى كل صفحة جديدة
// - تكرار صف عناوين جدول (عنصر عليه صنف options.repeatTableHeaderSelector) أعلى كل
//   صفحة جديدة طالما القطع وقع داخل نطاق الجدول المرتبط به
export async function exportElementToPdf(element, filename, orientation = 'p', options = {}) {
  const { repeatHeaderSelector = null, repeatTableHeaderSelector = null } = options;

  const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const ratio = imgWidth / element.offsetWidth; // مليمتر لكل بكسل CSS
  const devScale = canvas.width / element.offsetWidth; // بكسل الرسم لكل بكسل CSS (يطابق scale:2 أعلاه)
  const elementRect = element.getBoundingClientRect();

  const links = Array.from(element.querySelectorAll('a[href]')).map((a) => {
    const r = a.getBoundingClientRect();
    return {
      url: a.getAttribute('href'),
      x: (r.left - elementRect.left) * ratio,
      y: (r.top - elementRect.top) * ratio,
      w: r.width * ratio,
      h: r.height * ratio,
    };
  });

  const noBreakBlocks = Array.from(element.querySelectorAll('.pdf-avoid-break')).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: (r.top - elementRect.top) * ratio,
      bottom: (r.bottom - elementRect.top) * ratio,
    };
  });

  // اقتطاع صورة الرأس المتكرر (لو مطلوب)
  let headerImgData = null;
  let headerHeightMm = 0;
  if (repeatHeaderSelector) {
    const headerEl = element.querySelector(repeatHeaderSelector);
    if (headerEl) {
      const r = headerEl.getBoundingClientRect();
      const topPx = (r.top - elementRect.top) * devScale;
      const heightPx = r.height * devScale;
      headerImgData = cropCanvasRegion(canvas, topPx, heightPx).toDataURL('image/png');
      headerHeightMm = r.height * ratio;
    }
  }

  // اقتطاع صورة عناوين الجدول المتكررة (لو مطلوب)، مع تحديد نطاق الجدول اللي تنتمي له
  let tableHeadImgData = null;
  let tableHeadHeightMm = 0;
  let tableHeadBottomMm = 0;
  let tableBottomMm = 0;
  if (repeatTableHeaderSelector) {
    const theadEl = element.querySelector(repeatTableHeaderSelector);
    if (theadEl) {
      const r = theadEl.getBoundingClientRect();
      const topPx = (r.top - elementRect.top) * devScale;
      const heightPx = r.height * devScale;
      tableHeadImgData = cropCanvasRegion(canvas, topPx, heightPx).toDataURL('image/png');
      tableHeadHeightMm = r.height * ratio;
      tableHeadBottomMm = (r.bottom - elementRect.top) * ratio;

      const tableEl = theadEl.closest('table') || theadEl.parentElement;
      const tr = (tableEl || theadEl).getBoundingClientRect();
      tableBottomMm = (tr.bottom - elementRect.top) * ratio;
    }
  }

  function addLinksForRange(topMm, bottomMm, yShiftMm) {
    links.forEach((l) => {
      if (l.y >= topMm && l.y < bottomMm) {
        pdf.link(l.x, l.y - topMm + yShiftMm, l.w, l.h, { url: l.url });
      }
    });
  }

  let currentTopMm = 0;
  let pageIndex = 0;

  while (currentTopMm < imgHeight) {
    const isContinuation = pageIndex > 0;
    const needsTableHead = isContinuation
      && tableHeadImgData
      && currentTopMm > tableHeadBottomMm
      && currentTopMm < tableBottomMm;

    const reservedTopMm = (isContinuation && headerImgData ? headerHeightMm : 0)
      + (needsTableHead ? tableHeadHeightMm : 0);
    const availableHeightMm = pageHeight - reservedTopMm;

    let pageBottomMm = Math.min(currentTopMm + availableHeightMm, imgHeight);

    const breakingBlock = noBreakBlocks
      .filter((b) => b.top > currentTopMm && b.top < pageBottomMm && b.bottom > pageBottomMm)
      .sort((a, b) => a.top - b.top)[0];

    if (breakingBlock && breakingBlock.top > currentTopMm) {
      pageBottomMm = breakingBlock.top;
    }

    if (isContinuation) pdf.addPage();

    let yCursorMm = 0;
    if (isContinuation && headerImgData) {
      pdf.addImage(headerImgData, 'PNG', 0, yCursorMm, imgWidth, headerHeightMm);
      yCursorMm += headerHeightMm;
    }
    if (needsTableHead) {
      pdf.addImage(tableHeadImgData, 'PNG', 0, yCursorMm, imgWidth, tableHeadHeightMm);
      yCursorMm += tableHeadHeightMm;
    }

    pdf.addImage(imgData, 'PNG', 0, yCursorMm - currentTopMm, imgWidth, imgHeight);
    addLinksForRange(currentTopMm, pageBottomMm, yCursorMm - currentTopMm);

    currentTopMm = pageBottomMm;
    pageIndex += 1;
  }

  pdf.save(filename);
}
