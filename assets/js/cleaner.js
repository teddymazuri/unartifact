/* ============================================================
   UnArtifact — Cleaning Engine
   Runs entirely in browser memory. No network requests.
   Handles .docx (OOXML zip) and .doc (legacy binary) files.

   Fixes vs. previous revision:
     • readEntry() helper guards against null / unreadable entries.
     • docProps scrub loop skips directory stubs and removed entries.
     • word/document.xml retrieval uses readEntry() with a clear error.
   ============================================================ */

(function (global) {
  'use strict';

  /* ---------- Boilerplate regex patterns ---------- */
  const BOILERPLATE_PATTERNS = [
    /^\s*here\s+is\s+the\s+(revised|updated|cleaned|final)\s+document[:\-–—]?\s*/i,
    /^\s*certainly[!,]?\s+here\s+is[\s\S]{0,80}?[:\-–—]\s*/i,
    /^\s*sure[!,]?\s+here\s+(is|are)\s+[\s\S]{0,80}?[:\-–—]\s*/i,
    /^\s*of\s+course[!,]?\s+here\s+is[\s\S]{0,80}?[:\-–—]\s*/i,
    /^\s*i\s+hope\s+this\s+helps[!.]?\s*$/im,
    /^\s*let\s+me\s+know\s+if\s+you\s+(need|want|'d\s+like)[\s\S]{0,120}?[.!]?\s*$/im,
    /^\s*in\s+conclusion[,:]?\s*/im,
    /^\s*as\s+an\s+ai[\s\S]{0,120}?[.!]\s*/im,
    /^\s*here\s+is\s+your[\s\S]{0,80}?[:\-–—]\s*/i,
    /^\s*below\s+is\s+the[\s\S]{0,80}?[:\-–—]\s*/i,
    /^\s*i'?ve\s+(revised|updated|cleaned)[\s\S]{0,120}?[.!]?\s*$/im,
    /^\s*the\s+following\s+is\s+the[\s\S]{0,80}?[:\-–—]\s*/i,
  ];

  /* ---------- AI font families to reset on body prose ---------- */
  const AI_MONO_FONTS = [
    'consolas', 'courier new', 'monaco', 'menlo', 'source code pro', 'fira code',
  ];

  /* ---------- AI shading colors to strip ---------- */
  const AI_SHADING = ['f3f4f6', 'e5e7eb', 'f9fafb', 'f1f5f9', 'e2e8f0'];

  /* ============================================================
     Utility helpers
     ============================================================ */

  function log(msg) {
    if (typeof global.__unartifactLog === 'function') global.__unartifactLog(msg);
  }

  /**
   * Safely read an entry as a string. Returns null if the entry is
   * absent, was removed, or cannot be decoded — never throws.
   */
  async function readEntry(zip, name) {
    const e = zip.file(name);
    if (!e) return null;
    try {
      return await e.async('string');
    } catch (err) {
      log('warn: could not read ' + name + ' (' + err.message + ')');
      return null;
    }
  }

  /* ============================================================
     DOCX cleaning
     ============================================================ */

  async function cleanDocx(arrayBuffer, options, onProgress) {
    const zip = await JSZip.loadAsync(arrayBuffer);

    const report = {
      metadata: 0,
      formatting: 0,
      boilerplate: 0,
      revisions: 0,
      comments: 0,
    };

    /* -------- 1. Strip metadata files & document core props -------- */
    if (options.metadata) {
      const metaFiles = [
        'docProps/core.xml',
        'docProps/app.xml',
        'docProps/custom.xml',
        'docProps/thumbnail.jpeg',
        'docProps/thumbnail.emf',
        'docProps/thumbnail.wmf',
      ];
      metaFiles.forEach(f => {
        if (zip.file(f)) {
          zip.remove(f);
          report.metadata++;
          log('removed ' + f);
        }
      });

      // Also scrub any author-ish strings from remaining docProps/*.xml.
      // Snapshot the keys first — zip.file(name, data) mutates the map.
      const docPropsNames = Object.keys(zip.files).filter(
        n => n.startsWith('docProps/') && n.endsWith('.xml')
      );
      for (const name of docPropsNames) {
        const xml = await readEntry(zip, name);
        if (xml === null) continue;

        let out = xml;
        out = out.replace(/<dc:creator>[\s\S]*?<\/dc:creator>/gi,
                          '<dc:creator></dc:creator>');
        out = out.replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/gi,
                          '<cp:lastModifiedBy></cp:lastModifiedBy>');
        out = out.replace(/<cp:revision>[\s\S]*?<\/cp:revision>/gi,
                          '<cp:revision>1</cp:revision>');

        if (out !== xml) {
          report.metadata++;
          log('scrubbed ' + name);
          zip.file(name, out);
        }
      }
    }
    if (onProgress) onProgress(20, 'Metadata scrubbed');

    /* -------- 2. Clean word/document.xml -------- */
    const xml = await readEntry(zip, 'word/document.xml');
    if (xml === null) {
      throw new Error('Not a valid .docx: missing or unreadable word/document.xml');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');

    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const all = (tag) => Array.from(doc.getElementsByTagNameNS(W, tag));

    /* --- 2a. Remove revision tracking: w:ins, w:del, w:moveFrom, w:moveTo --- */
    if (options.metadata) {
      const changeTags = [
        'ins', 'del', 'moveFrom', 'moveTo',
        'rPrChange', 'pPrChange', 'tblPrChange', 'trPrChange',
        'tcPrChange', 'sectPrChange',
      ];
      changeTags.forEach(tag => {
        all(tag).forEach(node => {
          // For w:ins and w:moveTo, unwrap children (keep accepted text).
          if (tag === 'ins' || tag === 'moveTo') {
            const parent = node.parentNode;
            while (node.firstChild) parent.insertBefore(node.firstChild, node);
          }
          if (node.parentNode) node.parentNode.removeChild(node);
          report.revisions++;
        });
      });

      all('commentRangeStart').forEach(n => {
        if (n.parentNode) n.parentNode.removeChild(n);
        report.comments++;
      });
      all('commentRangeEnd').forEach(n => {
        const next = n.nextSibling;
        if (next && next.nodeType === 1 && next.localName === 'r') {
          const refs = Array.from(next.getElementsByTagNameNS(W, 'commentReference'));
          if (refs.length && next.parentNode) next.parentNode.removeChild(next);
        }
        if (n.parentNode) n.parentNode.removeChild(n);
      });
      log('revisions/comments removed: ' + report.revisions + '/' + report.comments);
    }
    if (onProgress) onProgress(40, 'Revision & comment marks removed');

    /* --- 2b. AI formatting cleanup --- */
    if (options.formatting) {
      // Reset run-level shading.
      all('shd').forEach(shd => {
        const fill = (shd.getAttributeNS(W, 'fill') || '').toLowerCase().replace('#', '');
        if (AI_SHADING.includes(fill)) {
          if (shd.parentNode) shd.parentNode.removeChild(shd);
          report.formatting++;
        }
      });

      // Reset monospace font overrides.
      all('rFonts').forEach(rf => {
        ['ascii', 'hAnsi', 'cs', 'eastAsia'].forEach(attr => {
          const v = (rf.getAttributeNS(W, attr) || '').toLowerCase();
          if (AI_MONO_FONTS.includes(v)) {
            rf.removeAttributeNS(W, attr);
            report.formatting++;
          }
        });
        if (!rf.attributes.length && rf.parentNode) rf.parentNode.removeChild(rf);
      });

      // Normalize paragraph indents that AI exporters emit as firstLine="0".
      all('ind').forEach(ind => {
        const firstLine = ind.getAttributeNS(W, 'firstLine');
        const hanging   = ind.getAttributeNS(W, 'hanging');
        if (firstLine === '0') { ind.removeAttributeNS(W, 'firstLine'); report.formatting++; }
        if (hanging   === '0') { ind.removeAttributeNS(W, 'hanging');   report.formatting++; }
        if (!ind.attributes.length && ind.parentNode) ind.parentNode.removeChild(ind);
      });

      // Remove hidden custom XML wrappers.
      const unwrapTags = ['customXml'];
      unwrapTags.forEach(tag => {
        all(tag).forEach(n => {
          const parent = n.parentNode;
          while (n.firstChild) parent.insertBefore(n.firstChild, n);
          parent.removeChild(n);
          report.formatting++;
        });
      });
      [
        'customXmlPr',
        'customXmlInsRangeStart', 'customXmlInsRangeEnd',
        'customXmlDelRangeStart', 'customXmlDelRangeEnd',
      ].forEach(tag => {
        all(tag).forEach(n => { if (n.parentNode) n.parentNode.removeChild(n); });
      });

      log('formatting fixes applied: ' + report.formatting);
    }
    if (onProgress) onProgress(60, 'AI formatting normalized');

    /* --- 2c. Boilerplate text scrubbing --- */
    if (options.boilerplate) {
      all('t').forEach(t => {
        const original = t.textContent;
        let txt = original;
        BOILERPLATE_PATTERNS.forEach(re => { txt = txt.replace(re, ''); });
        if (txt !== original) {
          t.textContent = txt;
          report.boilerplate++;
        }
      });

      // Remove paragraphs that became empty at the body level.
      all('p').forEach(p => {
        const parent = p.parentNode;
        if (!parent || parent.localName !== 'body') return;
        const hasDrawing = p.getElementsByTagNameNS(W, 'drawing').length > 0;
        const hasTable   = p.getElementsByTagNameNS(W, 'tbl').length > 0;
        const tNodes     = p.getElementsByTagNameNS(W, 't');
        const text = Array.from(tNodes).map(t => t.textContent).join('').trim();
        if (!hasDrawing && !hasTable && text === '' && tNodes.length > 0) {
          parent.removeChild(p);
        }
      });

      log('boilerplate passages removed: ' + report.boilerplate);
    }
    if (onProgress) onProgress(80, 'LLM boilerplate scrubbed');

    /* -------- 3. Re-serialize and re-zip -------- */
    const serializer = new XMLSerializer();
    const cleanedXml = serializer.serializeToString(doc);
    zip.file('word/document.xml', cleanedXml);

    // Remove comment/people parts entirely if metadata pass is on.
    if (options.metadata) {
      Object.keys(zip.files).forEach(name => {
        if (/^word\/comments.*\.xml$/i.test(name) ||
            /^word\/people\.xml$/i.test(name)) {
          zip.remove(name);
        }
      });
    }

    const outBlob = await zip.generateAsync(
      {
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        compression: 'DEFLATE',
      },
      meta => {
        if (onProgress) {
          onProgress(80 + Math.round(meta.percent * 0.2), 'Repacking .docx');
        }
      }
    );

    if (onProgress) onProgress(100, 'Done');
    return { blob: outBlob, report };
  }

  /* ============================================================
     DOC (legacy binary) cleaning
     Best-effort byte-level scrub — .doc is a compound binary
     format and full fidelity would require a heavy parser.
     ============================================================ */

  async function cleanDoc(arrayBuffer, options, onProgress) {
    const report = {
      metadata: 0,
      formatting: 0,
      boilerplate: 0,
      revisions: 0,
      comments: 0,
    };

    const bytes = new Uint8Array(arrayBuffer);

    // Decode as Latin-1 for byte-preserving string ops.
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }

    if (onProgress) onProgress(25, 'Scanning legacy .doc');

    if (options.boilerplate) {
      const asciiPhrases = [
        'Here is the revised document:',
        'Here is the updated document:',
        'Certainly! Here is',
        'Sure! Here is',
        'I hope this helps!',
        'Let me know if you need',
      ];
      asciiPhrases.forEach(phrase => {
        const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const before = bin.length;
        bin = bin.replace(re, '');
        if (bin.length !== before) report.boilerplate++;

        const utf16 = phrase.split('').join('\x00');
        const re16 = new RegExp(utf16.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const before16 = bin.length;
        bin = bin.replace(re16, '');
        if (bin.length !== before16) report.boilerplate++;
      });
    }

    if (options.metadata) {
      const authorRe = /(\x05SummaryInformation[\s\S]{0,4096}?)([\x20-\x7E]{3,64})\x00/g;
      const before = bin.length;
      bin = bin.replace(authorRe, (m, head) => head + '\x00');
      if (bin.length !== before) report.metadata++;
    }

    if (onProgress) onProgress(70, 'Legacy .doc artifacts scrubbed');

    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xFF;

    const blob = new Blob([out], { type: 'application/msword' });
    if (onProgress) onProgress(100, 'Done');
    return { blob, report };
  }

  /* ============================================================
     Public API
     ============================================================ */

  async function cleanFile(file, options, onProgress) {
    const name = file.name || '';
    const ext = (name.split('.').pop() || '').toLowerCase();
    const arrayBuffer = await file.arrayBuffer();

    let result;
    if (ext === 'docx') {
      result = await cleanDocx(arrayBuffer, options, onProgress);
    } else if (ext === 'doc') {
      result = await cleanDoc(arrayBuffer, options, onProgress);
    } else {
      throw new Error('Unsupported file type: .' + ext + ' — only .doc and .docx are accepted.');
    }

    // Preserve the original extension exactly.
    const base = name.replace(/\.[^.]+$/, '');
    const outName = base + '_unartifact.' + ext;

    return { blob: result.blob, report: result.report, outName, ext };
  }

  global.UnArtifactCleaner = { cleanFile };
})(window);