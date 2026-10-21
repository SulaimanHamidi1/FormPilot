// Extracts plain text from a resume file, entirely in the browser.
// PDF via the vendored pdf.js; DOCX via a minimal zip reader using the
// native DecompressionStream. Exposes JF.resumeExtract.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.resumeExtract) return;

  const PDFJS_URL = '../../lib/pdfjs/pdf.min.mjs';
  const PDFJS_WORKER_URL = '../../lib/pdfjs/pdf.worker.min.mjs';

  function kindOf(file) {
    const name = (file.name || '').toLowerCase();
    if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.docx') || file.type.includes('wordprocessingml')) return 'docx';
    if (file.type.startsWith('text/') || /\.(txt|md|text)$/.test(name)) return 'text';
    return null;
  }

  async function extractText(file) {
    const kind = kindOf(file);
    if (kind === 'pdf') return pdfText(await file.arrayBuffer());
    if (kind === 'docx') return docxText(await file.arrayBuffer());
    if (kind === 'text') return file.text();
    throw new Error('Unsupported file type. Use PDF, DOCX or TXT.');
  }

  // ---- PDF ----

  let pdfjsPromise;
  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(new URL(PDFJS_URL, location.href).href).then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = new URL(PDFJS_WORKER_URL, location.href).href;
        return lib;
      });
    }
    return pdfjsPromise;
  }

  async function pdfText(buffer) {
    const pdfjs = await loadPdfjs();
    const task = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false });
    const doc = await task.promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(itemsToLines(content.items));
    }
    await task.destroy();
    return pages.join('\n');
  }

  // Rebuild reading-order lines from positioned text items.
  function itemsToLines(items) {
    const lines = [];
    let current = null;
    for (const it of items) {
      if (typeof it.str !== 'string') continue;
      const y = it.transform ? Math.round(it.transform[5]) : 0;
      const x = it.transform ? it.transform[4] : 0;
      const h = Math.abs(it.height || (it.transform ? it.transform[3] : 10)) || 10;
      if (!current || Math.abs(current.y - y) > h * 0.5) {
        current = { y, text: '', endX: x };
        lines.push(current);
      } else if (it.str && current.text && !/\s$/.test(current.text) && x - current.endX > h * 0.25) {
        // Visible gap on the same baseline: keep columns apart.
        current.text += x - current.endX > h * 1.5 ? '   ' : ' ';
      }
      current.text += it.str;
      current.endX = x + (it.width || 0);
      if (it.hasEOL) current = null;
    }
    return lines.map((l) => l.text.replace(/\s+$/, '')).filter((t) => t.trim()).join('\n');
  }

  // ---- DOCX ----

  async function docxText(buffer) {
    const xml = await readZipEntry(buffer, 'word/document.xml');
    if (!xml) throw new Error('This DOCX file has no document body.');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const out = [];
    for (const p of doc.getElementsByTagNameNS(W, 'p')) {
      let line = '';
      const walk = (node) => {
        for (const child of node.childNodes) {
          if (child.namespaceURI !== W) continue;
          const name = child.localName;
          if (name === 't') line += child.textContent;
          else if (name === 'tab') line += '\t';
          else if (name === 'br' || name === 'cr') line += '\n';
          else if (name !== 'p') walk(child);
        }
      };
      walk(p);
      out.push(line);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  // Reads one file from a zip archive using the central directory.
  async function readZipEntry(buffer, wanted) {
    const view = new DataView(buffer);
    let eocd = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a valid DOCX (zip) file.');
    const count = view.getUint16(eocd + 10, true);
    let ptr = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (view.getUint32(ptr, true) !== 0x02014b50) break;
      const method = view.getUint16(ptr + 10, true);
      const compSize = view.getUint32(ptr + 20, true);
      const nameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      const localOffset = view.getUint32(ptr + 42, true);
      const name = decoder.decode(new Uint8Array(buffer, ptr + 46, nameLen));
      if (name === wanted) {
        const lNameLen = view.getUint16(localOffset + 26, true);
        const lExtraLen = view.getUint16(localOffset + 28, true);
        const start = localOffset + 30 + lNameLen + lExtraLen;
        const data = new Uint8Array(buffer, start, compSize);
        if (method === 0) return decoder.decode(data);
        if (method !== 8) throw new Error('Unsupported DOCX compression.');
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(stream).text();
      }
      ptr += 46 + nameLen + extraLen + commentLen;
    }
    return null;
  }

  JF.resumeExtract = { extractText, kindOf, itemsToLines, docxText };
})();
