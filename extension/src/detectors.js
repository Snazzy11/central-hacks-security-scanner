// PII detectors. Pure functions, no DOM — usable from content scripts and Node tests.
(function (root) {
  'use strict';

  function luhnValid(digits) {
    let sum = 0;
    let dbl = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = digits.charCodeAt(i) - 48;
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
      dbl = !dbl;
    }
    return sum % 10 === 0;
  }

  function ibanValid(raw) {
    const s = raw.replace(/\s+/g, '').toUpperCase();
    if (s.length < 15 || s.length > 34) return false;
    const rearranged = s.slice(4) + s.slice(0, 4);
    let rem = 0;
    for (const ch of rearranged) {
      const code = ch.charCodeAt(0);
      const val = code >= 65 && code <= 90 ? String(code - 55) : ch;
      for (const c of val) rem = (rem * 10 + (c.charCodeAt(0) - 48)) % 97;
    }
    return rem === 1;
  }

  // Each detector: id, label, regex (global), optional validate(match) and
  // optional group (capture group index holding the sensitive part).
  // Order = priority when matches overlap.
  const DETECTORS = [
    {
      id: 'SSN',
      label: 'US Social Security number',
      regex: /(?<![\d-])(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}(?![\d-])/g,
    },
    {
      id: 'CREDIT_CARD',
      label: 'Payment card number',
      regex: /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g,
      validate: (m) => {
        const digits = m.replace(/\D/g, '');
        return digits.length >= 13 && digits.length <= 19 && luhnValid(digits) && !/^(\d)\1+$/.test(digits);
      },
    },
    {
      id: 'IBAN',
      label: 'Bank account (IBAN)',
      regex: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g,
      validate: ibanValid,
    },
    {
      id: 'EMAIL',
      label: 'Email address',
      regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    },
    {
      id: 'DOB',
      label: 'Date of birth',
      regex: /\b(?:DOB|D\.O\.B\.?|date of birth|birth ?date|born(?: on)?)\s*[:\-]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2},? \d{4})/gi,
      group: 1,
    },
    {
      id: 'PHONE',
      label: 'Phone number',
      regex: /(?<![\w+-])(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]?\d{3}[ .-]?\d{4}(?![\w-])|(?<![\w+])\+\d{1,3}(?:[ .-]?\d{2,4}){2,5}(?![\w-])/g,
      validate: (m) => {
        const digits = m.replace(/\D/g, '');
        return digits.length >= 10 && digits.length <= 15;
      },
    },
    {
      id: 'IP_ADDRESS',
      label: 'IP address',
      regex: /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\d.])/g,
    },
  ];

  const DEFAULT_ENABLED = Object.fromEntries(DETECTORS.map((d) => [d.id, true]));

  /**
   * Find PII in text.
   * @returns {{type:string,start:number,end:number,value:string}[]} sorted, non-overlapping
   */
  function findPII(text, enabled = DEFAULT_ENABLED) {
    const raw = [];
    DETECTORS.forEach((det, priority) => {
      if (!enabled[det.id]) return;
      det.regex.lastIndex = 0;
      let m;
      while ((m = det.regex.exec(text)) !== null) {
        if (m[0].length === 0) { det.regex.lastIndex++; continue; }
        let start = m.index;
        let value = m[0];
        if (det.group) {
          value = m[det.group];
          if (!value) continue;
          start = m.index + m[0].lastIndexOf(value);
        }
        if (det.validate && !det.validate(value)) continue;
        raw.push({ type: det.id, start, end: start + value.length, value, priority });
      }
    });
    // Resolve overlaps: higher priority (lower index) wins, then longer match.
    raw.sort((a, b) => a.priority - b.priority || (b.end - b.start) - (a.end - a.start));
    const taken = [];
    for (const r of raw) {
      if (taken.some((t) => r.start < t.end && t.start < r.end)) continue;
      taken.push(r);
    }
    taken.sort((a, b) => a.start - b.start);
    return taken.map(({ priority, ...rest }) => rest);
  }

  function replacementFor(type) {
    return `[REDACTED:${type}]`;
  }

  function redactText(text, matches) {
    let out = '';
    let pos = 0;
    for (const m of matches) {
      out += text.slice(pos, m.start) + replacementFor(m.type);
      pos = m.end;
    }
    return out + text.slice(pos);
  }

  /** Mask a value for display in the UI so we never echo full PII back. */
  function maskForDisplay(value) {
    const v = value.trim();
    if (v.length <= 4) return '•'.repeat(v.length);
    const keep = Math.min(2, Math.floor(v.length / 5));
    return v.slice(0, keep) + '•'.repeat(Math.max(3, v.length - keep * 2)) + v.slice(v.length - keep);
  }

  const api = { DETECTORS, DEFAULT_ENABLED, findPII, redactText, replacementFor, maskForDisplay, luhnValid, ibanValid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PIIDetectors = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
