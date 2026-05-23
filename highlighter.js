// Wrapped in IIFE to avoid naming conflicts with interpreter.js
(function () {
  // ============================================================
  // SEALLANG SYNTAX HIGHLIGHTER
  // Mirrors the VS Code extension's seallang.tmlanguage.json
  // scopes exactly, mapped to CSS classes.
  //
  // Works as a textarea overlay: the textarea is transparent
  // with a coloured caret; the highlight-layer div behind it
  // shows the coloured tokens. Both scroll in sync.
  // ============================================================

  // ---- Token definitions (same order as TextMate grammar) ----

  const BUILTINS = new Set([
    'bark','fish','fish_int','fish_float',
    'sqrt','pow','abs_int','abs_float','floor','ceil','min_int','max_int','len',
  ]);

  const KEYWORDS = new Set([
    'if','else','swim','in','match','catch','tide','surface',
  ]);

  const DECL_KEYWORDS = new Set(['let','mut']);
  const TYPES = new Set(['int','float','bool','str']);
  const BOOLEANS = new Set(['true','false']);

  // ---- Core tokeniser ----
  // Returns an array of { cls, text } spans for one line of source.
  // We handle strings specially (multi-token inside) then fall back
  // to word/operator scanning for the rest.

  function tokeniseLine(line) {
    const spans = [];
    let i = 0;
    const len = line.length;

    function push(cls, text) { spans.push({ cls, text }); }

    while (i < len) {
      // ── Comment: ~ to end of line ──
      if (line[i] === '~') {
        push('hl-comment', line.slice(i));
        break;
      }

      // ── String literal ──
      if (line[i] === '"') {
        // Collect everything inside the string, tagging escape sequences
        // and interpolation variables separately.
        let j = i + 1;
        const stringSpans = [{ cls: 'hl-string', text: '"' }];

        while (j < len && line[j] !== '"') {
          // Escape sequence
          if (line[j] === '\\' && j + 1 < len) {
            stringSpans.push({ cls: 'hl-escape', text: line.slice(j, j + 2) });
            j += 2;
            continue;
          }
          // Interpolation: {varName}
          if (line[j] === '{') {
            const m = line.slice(j).match(/^\{[a-zA-Z_][a-zA-Z0-9_]*\}/);
            if (m) {
              stringSpans.push({ cls: 'hl-interp', text: m[0] });
              j += m[0].length;
              continue;
            }
          }
          // Accumulate plain string chars
          const last = stringSpans[stringSpans.length - 1];
          if (last.cls === 'hl-string') {
            last.text += line[j];
          } else {
            stringSpans.push({ cls: 'hl-string', text: line[j] });
          }
          j++;
        }
        if (j < len) { // closing "
          stringSpans.push({ cls: 'hl-string', text: '"' });
          j++;
        }
        spans.push(...stringSpans);
        i = j;
        continue;
      }

      // ── Two-char operators ──
      const two = line.slice(i, i + 2);
      if (two === '->') { push('hl-arrow', '->'); i += 2; continue; }
      if (two === '..') { push('hl-op',    '..'); i += 2; continue; }
      if (['==','!=','<=','>=','&&','||'].includes(two)) {
        push('hl-op', two); i += 2; continue;
      }

      // ── Single-char operators / punctuation ──
      if ('+-*/%<>=!'.includes(line[i])) {
        push('hl-op', line[i]); i++; continue;
      }

      // ── Whitespace — preserve as plain ──
      if (/\s/.test(line[i])) {
        const start = i;
        while (i < len && /\s/.test(line[i])) i++;
        push('', line.slice(start, i));
        continue;
      }

      // ── Identifier or number ──
      // Number (float first)
      const numMatch = line.slice(i).match(/^[0-9]+\.[0-9]+/);
      if (numMatch) { push('hl-number', numMatch[0]); i += numMatch[0].length; continue; }
      const intMatch = line.slice(i).match(/^[0-9]+/);
      if (intMatch) { push('hl-number', intMatch[0]); i += intMatch[0].length; continue; }

      // Word
      const wordMatch = line.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
      if (wordMatch) {
        const word = wordMatch[0];
        i += word.length;

        // Look ahead: is it followed by `(`?  → function call or builtin
        const isCall = i < len && line[i] === '(';

        // Classify
        if (word === 'dive') {
          // "dive funcName(" — split into keyword + function name
          push('hl-fn-kw', word);
          // skip whitespace
          while (i < len && line[i] === ' ') { push('', ' '); i++; }
          const fnMatch = line.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
          if (fnMatch) { push('hl-fn-name', fnMatch[0]); i += fnMatch[0].length; }
          continue;
        }
        if (word === 'pod') {
          push('hl-pod-kw', word);
          while (i < len && line[i] === ' ') { push('', ' '); i++; }
          const podMatch = line.slice(i).match(/^[A-Z][a-zA-Z0-9_]*/);
          if (podMatch) { push('hl-pod-name', podMatch[0]); i += podMatch[0].length; }
          continue;
        }
        if (KEYWORDS.has(word))      { push('hl-keyword', word); continue; }
        if (DECL_KEYWORDS.has(word)) { push('hl-decl',    word); continue; }
        if (TYPES.has(word))         { push('hl-type',    word); continue; }
        if (BOOLEANS.has(word))      { push('hl-bool',    word); continue; }
        if (BUILTINS.has(word))      { push('hl-builtin', word); continue; }
        // Uppercase-first → pod type name
        if (/^[A-Z]/.test(word))     { push('hl-pod-name', word); continue; }
        // Lowercase followed by ( → user function call
        if (isCall)                  { push('hl-fn-name', word); continue; }
        // Plain identifier
        push('', word);
        continue;
      }

      // ── Anything else (brackets, commas, etc.) — plain ──
      push('', line[i]);
      i++;
    }

    return spans;
  }

  // ---- Render spans to safe HTML ──
  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function spansToHtml(spans) {
    return spans.map(({ cls, text }) => {
      const safe = escapeHtml(text);
      return cls ? `<span class="${cls}">${safe}</span>` : safe;
    }).join('');
  }

  // ---- Full source → highlighted HTML ──
  function highlight(source) {
    return source
      .split('\n')
      .map(line => spansToHtml(tokeniseLine(line)))
      .join('\n');
  }

  // ---- Wire up textarea ↔ highlight layer ──

  function initHighlighter() {
    const textarea = document.getElementById('editor');
    const layer    = document.getElementById('highlightLayer');

    if (!textarea || !layer) return;

    function update() {
      // Append a trailing newline so the layer height matches the textarea
      // when the last line is empty.
      layer.innerHTML = highlight(textarea.value) + '\n';
    }

    // Sync scroll position
    function syncScroll() {
      layer.scrollTop  = textarea.scrollTop;
      layer.scrollLeft = textarea.scrollLeft;
    }

    textarea.addEventListener('input',  update);
    textarea.addEventListener('scroll', syncScroll);

    // Also sync after resize (drag handle)
    new ResizeObserver(syncScroll).observe(textarea);

    // Initial render
    update();
    // Now that the layer is active, hide the raw textarea text
    textarea.style.color = "transparent";
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHighlighter);
  } else {
    initHighlighter();
  }

  // Expose a global so other scripts can trigger a highlight refresh
  window.sealRefreshHighlight = function() {
    const textarea = document.getElementById('editor');
    const layer    = document.getElementById('highlightLayer');
    if (textarea && layer) layer.innerHTML = highlight(textarea.value) + '\n';
  };

})();
