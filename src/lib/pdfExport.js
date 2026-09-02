import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// الدالة القياسية (تبقى كما هي، مستقرة) — تُستخدم لأي تقرير لسه ما انتقل للقالب الجديد.
export async function exportElementToPdf(element, filename, orientation = 'p') {
  const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const ratio = imgWidth / element.offsetWidth;
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

  function addLinksForRange(topMm, bottomMm) {
    links.forEach((l) => {
      if (l.y >= topMm && l.y < bottomMm) {
        pdf.link(l.x, l.y - topMm, l.w, l.h, { url: l.url });
      }
    });
  }

  let currentTopMm = 0;
  let firstPage = true;

  while (currentTopMm < imgHeight) {
    let pageBottomMm = Math.min(currentTopMm + pageHeight, imgHeight);

    const breakingBlock = noBreakBlocks
      .filter((b) => b.top > currentTopMm && b.top < pageBottomMm && b.bottom > pageBottomMm)
      .sort((a, b) => a.top - b.top)[0];

    if (breakingBlock && breakingBlock.top > currentTopMm) {
      pageBottomMm = breakingBlock.top;
    }

    if (!firstPage) pdf.addPage();
    firstPage = false;

    pdf.addImage(imgData, 'PNG', 0, -currentTopMm, imgWidth, imgHeight);
    addLinksForRange(currentTopMm, pageBottomMm);

    currentTopMm = pageBottomMm;
  }

  pdf.save(filename);
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// تصدير تقرير باستخدام قالب خلفية جاهز (شعار وحدود ثابتة)، مع رسم الهيدر والفوتر
// كصورتين مستقلتين تُلتقطان مرة واحدة بس. نحوّل كل صورة لعنصر <img> محمَّل فعليًا
// (بدل تمرير نص base64 مباشرة) ونعيد استخدام نفس العنصر بكل صفحة — هذا يتفادى خللًا
// معروفًا بمتصفح Safari/iOS عند إعادة استخدام نفس نص base64 لصورة صغيرة عدة مرات
// بمستند PDF واحد عبر jsPDF.
export async function exportReportWithTemplate({
  templateSrc,
  headerEl,
  bodyEl,
  footerEl,
  orientation = 'l',
  filename,
  zones,
}) {
  const { headerTop, contentTop, contentBottom, footerTop, marginX } = zones;

  const templateImg = await loadImageElement(templateSrc);

  const headerCanvas = await html2canvas(headerEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  const footerCanvas = footerEl
    ? await html2canvas(footerEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
    : null;
  const bodyCanvas = await html2canvas(bodyEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });

  const headerImg = await loadImageElement(headerCanvas.toDataURL('image/png'));
  const footerImg = footerCanvas ? await loadImageElement(footerCanvas.toDataURL('image/png')) : null;

  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidthMm = pageWidth - marginX * 2;

  const headerHeightMm = (headerCanvas.height * contentWidthMm) / headerCanvas.width;

  let footerHeightMm = 0;
  if (footerCanvas) {
    footerHeightMm = (footerCanvas.height * contentWidthMm) / footerCanvas.width;
  }

  const bodyImgData = bodyCanvas.toDataURL('image/png');
  const bodyImgHeightMm = (bodyCanvas.height * contentWidthMm) / bodyCanvas.width;

  const bodyRatio = contentWidthMm / bodyEl.offsetWidth;
  const bodyElRect = bodyEl.getBoundingClientRect();
  const rowBlocks = Array.from(bodyEl.querySelectorAll('.pdf-avoid-break')).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: (r.top - bodyElRect.top) * bodyRatio,
      bottom: (r.bottom - bodyElRect.top) * bodyRatio,
    };
  });

  const contentZoneHeightMm = contentBottom - contentTop;

  function drawStaticLayer() {
    pdf.addImage(templateImg, 'PNG', 0, 0, pageWidth, pageHeight);
    pdf.addImage(headerImg, 'PNG', marginX, headerTop, contentWidthMm, headerHeightMm);
    if (footerImg) {
      pdf.addImage(footerImg, 'PNG', marginX, footerTop, contentWidthMm, footerHeightMm);
    }
  }

  let currentBodyTopMm = 0;
  let firstPage = true;

  while (currentBodyTopMm < bodyImgHeightMm) {
    let pageBodyBottomMm = Math.min(currentBodyTopMm + contentZoneHeightMm, bodyImgHeightMm);

    const breakingRow = rowBlocks
      .filter((b) => b.top > currentBodyTopMm && b.top < pageBodyBottomMm && b.bottom > pageBodyBottomMm)
      .sort((a, b) => a.top - b.top)[0];
    if (breakingRow && breakingRow.top > currentBodyTopMm) {
      pageBodyBottomMm = breakingRow.top;
    }

    if (!firstPage) pdf.addPage();
    firstPage = false;

    drawStaticLayer();
    pdf.addImage(bodyImgData, 'PNG', marginX, contentTop - currentBodyTopMm, contentWidthMm, bodyImgHeightMm);

    currentBodyTopMm = pageBodyBottomMm;
  }

  pdf.save(filename);
}
