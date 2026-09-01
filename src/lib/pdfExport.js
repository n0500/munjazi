import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// يحوّل عنصر HTML إلى PDF متعدد الصفحات، مع الحفاظ على أي روابط <a href> بداخله
// قابلة للنقر فعليًا داخل ملف الـPDF، ومع تفادي قطع أي عنصر مُعلَّم بصنف
// "pdf-avoid-break" بمنتصف صفحتين — يُنقل القسم كاملًا للصفحة التالية بدلًا من ذلك.
export async function exportElementToPdf(element, filename, orientation = 'p') {
  const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  // نسبة تحويل من بكسل (حجم العنصر بالمتصفح) إلى مليمتر (حجم صفحة الـPDF)
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

  // حدود كل قسم "لا يجوز قطعه" (بالمليمتر، نسبةً لأعلى العنصر كامل) — لو صادفت
  // القص المنطقي لصفحة، ننقل نقطة القطع لتكون قبل بداية القسم بدلًا من داخله
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

    // لو فيه قسم يبدأ داخل هذي الصفحة لكن ينتهي بعدها (يعني راح ينقطع)، نقصّ الصفحة قبله
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
