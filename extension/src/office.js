// File scanning: plain-text files and Office Open XML (.docx/.xlsx/.pptx).
(function (root) {
  'use strict';
  const D = root.PIIDetectors || (typeof require !== 'undefined' && require('./detectors.js'));
  const Z = root.PIIZip || (typeof require !== 'undefined' && require('./zip.js'));

  const MAX_BYTES = 50 * 1024 * 1024;
  const TEXT_EXT = new Set(['txt', 'csv', 'tsv', 'md', 'markdown', 'json', 'jsonl', 'xml', 'html', 'htm',
    'log', 'yaml', 'yml', 'ini', 'cfg', 'conf', 'eml', 'vcf', 'rtf', 'sql', 'tex']);
  const OFFICE = {
    docx: [[/^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/, '</w:p>', 'w:t']],
    pptx: [[/^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+|comments\/[^/]+)\.xml$/, '</a:p>', 'a:t']],
    xlsx: [
      [/^xl\/sharedStrings\.xml$/, '</si>', 't'],
      [/^xl\/worksheets\/sheet\d+\.xml$/, '</is>', 't'],
      [/^xl\/comments\d*\.xml$/, '</comment>', 't'],
    ],
  };
  const METADATA_PART = 'docProps/core.xml';
  const METADATA_TAGS = ['dc:creator', 'cp:lastModifiedBy'];

  const ext = (name) => (name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();

  function decodeXml(s) {
    return s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(lt|gt|amp|quot|apos));/gi, (_, dec, hex, named) => {
      if (dec) return String.fromCodePoint(+dec);
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[named.toLowerCase()];
    });
  }
  const encodeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /**
   * Redact PII in an XML part whose text is split into runs (<w:t>, <a:t>, <t>).
   * Text is joined per paragraph so PII split across runs is still caught.
   */
  function redactXmlRuns(xml, paraClose, tag, enabled) {
    const nodeRe = new RegExp(`(<${tag}(?:\\s[^>]*)?>)([^<]*)(</${tag}>)`, 'g');
    const segments = xml.split(paraClose);
    const findings = [];
    const out = segments.map((seg) => {
      const nodes = [];
      let m;
      nodeRe.lastIndex = 0;
      while ((m = nodeRe.exec(seg)) !== null) {
        nodes.push({ index: m.index, full: m[0], open: m[1], text: decodeXml(m[2]), close: m[3] });
      }
      if (!nodes.length) return seg;
      let concat = '';
      for (const n of nodes) { n.s = concat.length; concat += n.text; n.e = concat.length; }
      const matches = D.findPII(concat, enabled);
      if (!matches.length) return seg;
      findings.push(...matches.map(({ type, value }) => ({ type, value })));

      let rebuilt = '';
      let last = 0;
      for (const n of nodes) {
        let text = '';
        let pos = n.s;
        for (const mm of matches) {
          if (mm.end <= n.s || mm.start >= n.e) continue;
          text += concat.slice(pos, Math.max(pos, mm.start));
          if (mm.start >= n.s) text += D.replacementFor(mm.type);
          pos = Math.min(Math.max(mm.end, pos), n.e);
        }
        text += concat.slice(pos, n.e);
        let open = n.open;
        if (text !== n.text && /^\s|\s$/.test(text) && !/xml:space/.test(open)) {
          open = open.replace(/>$/, ' xml:space="preserve">');
        }
        rebuilt += seg.slice(last, n.index) + open + encodeXml(text) + n.close;
        last = n.index + n.full.length;
      }
      return rebuilt + seg.slice(last);
    });
    return { xml: out.join(paraClose), findings };
  }

  function stripMetadata(xml) {
    const findings = [];
    for (const tag of METADATA_TAGS) {
      xml = xml.replace(new RegExp(`(<${tag}(?:\\s[^>]*)?>)([^<]+)(</${tag}>)`, 'g'), (_, o, v, c) => {
        if (v.trim()) findings.push({ type: 'METADATA', value: decodeXml(v) });
        return o + c;
      });
    }
    return { xml, findings };
  }

  async function scanOffice(file, kind, settings) {
    const entries = Z.readZip(await file.arrayBuffer());
    const dec = new TextDecoder();
    const enc = new TextEncoder();
    const findings = [];
    const changes = new Map(); // entry -> new xml
    for (const e of entries) {
      const rule = OFFICE[kind].find(([re]) => re.test(e.name));
      const isMeta = settings.stripMetadata && e.name === METADATA_PART;
      if (!rule && !isMeta) continue;
      const xml = dec.decode(await Z.entryBytes(e));
      const res = rule ? redactXmlRuns(xml, rule[1], rule[2], settings.enabled) : stripMetadata(xml);
      if (res.findings.length) {
        findings.push(...res.findings);
        changes.set(e, res.xml);
      }
    }
    return {
      findings,
      redact: async () => {
        for (const [e, xml] of changes) await Z.setEntryBytes(e, enc.encode(xml));
        return new File([Z.writeZip(entries)], file.name, { type: file.type, lastModified: Date.now() });
      },
    };
  }

  function looksBinary(bytes) {
    const n = Math.min(bytes.length, 8192);
    for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
    return false;
  }

  async function scanText(file, settings) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (looksBinary(bytes)) return null;
    const text = new TextDecoder().decode(bytes);
    const matches = D.findPII(text, settings.enabled);
    return {
      findings: matches.map(({ type, value }) => ({ type, value })),
      redact: async () => new File([D.redactText(text, matches)], file.name, { type: file.type, lastModified: Date.now() }),
    };
  }

  /**
   * Scan one file.
   * @returns {Promise<{file, status:'clean'|'pii'|'unsupported', reason?, findings, redact?}>}
   */
  async function scanFile(file, settings) {
    const e = ext(file.name);
    const base = { file, findings: [] };
    if (file.size > MAX_BYTES) return { ...base, status: 'unsupported', reason: 'too large to scan' };
    try {
      let res = null;
      if (OFFICE[e]) res = await scanOffice(file, e, settings);
      else if (TEXT_EXT.has(e) || /^text\/|\/(json|xml)$/.test(file.type)) res = await scanText(file, settings);
      if (!res) {
        const label = e ? `.${e} files` : 'this file type';
        return { ...base, status: 'unsupported', reason: `${label} can't be inspected` };
      }
      return { ...base, ...res, status: res.findings.length ? 'pii' : 'clean' };
    } catch (err) {
      return { ...base, status: 'unsupported', reason: `could not be read (${err.message})` };
    }
  }

  const api = { scanFile, redactXmlRuns, stripMetadata, decodeXml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PIIScanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
