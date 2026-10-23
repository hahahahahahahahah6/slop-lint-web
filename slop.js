/* slop-lint web engine — JS port of slop_lint.py (Python).
 *
 * Rule data (word lists, regex sources) lives in rules.json, which is
 * auto-extracted from slop_lint.py by tools/extract_rules.py — never
 * hand-edit the lists here. This file mirrors the Python scoring logic
 * 1:1 so the web demo scores identically to the CLI.
 */
"use strict";

function pyEscape(s) {
  // Mirror Python 3.12 re.escape for the characters in our lists:
  // alphanumerics stay, specials get a backslash, space becomes "\ ".
  return s.replace(/[^A-Za-z0-9_]/g, (ch) => (ch === " " ? "\\ " : "\\" + ch));
}

function compilePhraseList(phrases) {
  const ordered = [...phrases].sort((a, b) => b.length - a.length);
  const alts = ordered.map((p) => pyEscape(p).split("\\ ").join("\\s+"));
  return new RegExp("\\b(?:" + alts.join("|") + ")\\b", "gi");
}

function compileWordList(words) {
  const ordered = [...words].sort((a, b) => b.length - a.length);
  return new RegExp(ordered.map(pyEscape).join("|"), "g");
}

function pyRound(x, ndigits = 0) {
  // Python's round(): round-half-to-even (banker's rounding).
  const p = Math.pow(10, ndigits);
  const n = x * p;
  const f = Math.floor(n);
  const d = n - f;
  let r;
  if (d < 0.5) r = f;
  else if (d > 0.5) r = f + 1;
  else r = f % 2 === 0 ? f : f + 1;
  return r / p;
}

function countSyllables(word) {
  word = word.toLowerCase().replace(/^['-]+|['-]+$/g, "");
  if (!word) return 0;
  const groups = word.match(/[aeiouy]+/g) || [];
  let n = groups.length;
  if (word.endsWith("e") && n > 1 && !/(ee|ye|oe)$/.test(word)) n -= 1;
  return Math.max(n, 1);
}

function makeEngine(R) {
  const P = R.patterns;
  const BUZZ_RE = compilePhraseList(R.buzzwords);
  const HEDGE_RE = compilePhraseList(R.hedges);
  const ZH_L1_RE = compileWordList(R.zh_l1_words);
  const ZH_L2_RE = compileWordList(R.zh_l2_words);
  const ZH_OPENING_RE = compileWordList(R.zh_openings);
  const ZH_CLOSING_RE = compileWordList(R.zh_closings);
  const ZH_UNSOURCED_RE = compileWordList(R.zh_unsourced);
  const ZH_CHAI_RE = new RegExp(P.zh_chai, "g");
  const ZH_LEDGER_RE = new RegExp(P.zh_ledger, "g");
  const ZH_NOTBUT = P.zh_notbut.map((s) => new RegExp(s, "g"));
  const ZH_NEGOPEN_RE = new RegExp(P.zh_negopen);
  const ZH_DECHAIN_RE = new RegExp(P.zh_dechain);
  const ZH_EMPTYVERB_RE = new RegExp(P.zh_emptyverb);
  const ZH_PREJUDGE_RE = new RegExp(P.zh_prejudge);
  const EMDASH_RE = new RegExp(P.emdash, "g");
  const CJK_RE = new RegExp(P.cjk, "g");
  const CJK_TEST = new RegExp(P.cjk);
  const WORD_RE = new RegExp(P.word, "g");
  const VOWEL_RE = new RegExp(P.vowel_group, "g");
  const BOUND_RE = new RegExp(P.bound, "g");
  const FENCE_START_RE = new RegExp(P.fence_start);
  const BLOCK_START_RE = new RegExp(P.block_start);
  void VOWEL_RE;

  const LONG_SENTENCE_WORDS = R.long_sentence_words;
  const EMDASH_LIMIT = R.emdash_limit;

  function stripFencedCode(text) {
    const out = [];
    let inFence = false;
    for (const line of text.split("\n")) {
      if (FENCE_START_RE.test(line)) { inFence = !inFence; continue; }
      if (!inFence) out.push(line);
    }
    return out.join("\n");
  }

  function paragraphsWithLines(text) {
    const paras = [];
    let buf = [];
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        if (buf.length) { paras.push(buf); buf = []; }
        continue;
      }
      if (BLOCK_START_RE.test(line)) {
        if (buf.length) paras.push(buf);
        buf = [[line, i + 1]];
        continue;
      }
      buf.push([line, i + 1]);
    }
    if (buf.length) paras.push(buf);
    return paras;
  }

  function sentenceBounds(para) {
    const bounds = [0];
    BOUND_RE.lastIndex = 0;
    let m;
    while ((m = BOUND_RE.exec(para)) !== null) {
      bounds.push(m.index + m[0].length);
      // Zero-width lookbehind matches (CJK terminators) don't advance
      // lastIndex by themselves — step forward like Python's finditer does.
      if (m[0].length === 0) BOUND_RE.lastIndex = m.index + 1;
    }
    bounds.push(para.length);
    const out = [];
    for (let i = 0; i + 1 < bounds.length; i++) {
      const [a, b] = [bounds[i], bounds[i + 1]];
      if (para.slice(a, b).trim()) out.push([a, b]);
    }
    return out;
  }

  function splitSentences(text) {
    const sentences = [];
    for (const lines of paragraphsWithLines(stripFencedCode(text))) {
      const para = lines.map(([t]) => t).join(" ");
      const offsets = [];
      let pos = 0;
      for (const [t] of lines) { offsets.push(pos); pos += t.length + 1; }
      for (const [a, b] of sentenceBounds(para)) {
        const part = para.slice(a, b).trim();
        if (!part) continue;
        let sa = a;
        while (sa < b && (para[sa] === " " || para[sa] === "\t")) sa++;
        let lineno = lines[0][1];
        for (let idx = 0; idx < offsets.length; idx++) {
          if (offsets[idx] <= sa) lineno = lines[idx][1];
          else break;
        }
        sentences.push([part, lineno]);
      }
    }
    return sentences;
  }

  function ledgerLiteralSpans(text) {
    const spans = [];
    for (const phrase of R.zh_l1_exempt) {
      let idx = text.indexOf(phrase);
      while (idx !== -1) {
        spans.push([idx, idx + phrase.length]);
        idx = text.indexOf(phrase, idx + 1);
      }
    }
    return spans;
  }

  function dedupSpans(candidates) {
    // candidates: [start, end, prio, finding]; higher prio wins, ties: longer span.
    const sorted = [...candidates].sort(
      (c1, c2) => c2[2] - c1[2] || (c2[1] - c2[0]) - (c1[1] - c1[0]));
    const kept = [];
    for (const [start, end, , finding] of sorted) {
      if (kept.some(([ks, ke]) => start < ke && end > ks)) continue;
      kept.push([start, end, finding]);
    }
    kept.sort((k1, k2) => k1[2].line - k2[2].line || k1[0] - k2[0]);
    return kept.map((k) => k[2]);
  }

  function zhFindings(text, stripped) {
    const findings = [];
    let l1 = 0, l2 = 0, structure = 0;

    for (const [sentence, lineNo] of splitSentences(text)) {
      const candidates = [];
      const add = (rule, severity, message, start, end, prio) =>
        candidates.push([start, end, prio, { line: lineNo, rule, severity, message }]);

      const scan = (re, fn) => { re.lastIndex = 0; let m; while ((m = re.exec(sentence)) !== null) fn(m); };

      scan(ZH_L1_RE, (m) => add("zh-l1", "L1",
        `AI-flavor word (L1, must rewrite): "${m[0]}"`, m.index, m.index + m[0].length, 3));
      scan(ZH_CHAI_RE, (m) => add("zh-l1", "L1",
        `AI-flavor word (L1, must rewrite): "${m[0]}…"`, m.index, m.index + m[0].length, 3));
      scan(ZH_LEDGER_RE, (m) => {
        const zhang = m.index + m[0].indexOf("账");
        if (ledgerLiteralSpans(sentence).some(([s, e]) => s <= zhang && zhang < e)) return;
        add("zh-l1", "L1",
          `AI-flavor word (L1, must rewrite): "${m[0]}"`, m.index, m.index + m[0].length, 3);
      });
      scan(ZH_L2_RE, (m) => add("zh-l2", "L2",
        `Risky word (L2, review): "${m[0]}"`, m.index, m.index + m[0].length, 2));
      scan(ZH_OPENING_RE, (m) => add("zh-opening", "L1",
        `Cliché opening: "${m[0]}"`, m.index, m.index + m[0].length, 1));
      scan(ZH_CLOSING_RE, (m) => add("zh-closing", "L1",
        `Cliché closing: "${m[0]}"`, m.index, m.index + m[0].length, 1));
      scan(ZH_UNSOURCED_RE, (m) => add("zh-unsourced", "L2",
        `Unsourced authority: "${m[0]}" (flag or cite, never invent)`,
        m.index, m.index + m[0].length, 1));

      for (const f of dedupSpans(candidates)) {
        findings.push(f);
        if (f.rule === "zh-l1") l1++;
        else if (f.rule === "zh-l2") l2++;
        else structure++;
      }

      for (const pat of ZH_NOTBUT) {
        pat.lastIndex = 0;
        let m;
        while ((m = pat.exec(sentence)) !== null) {
          findings.push({
            line: lineNo, rule: "zh-not-but", severity: "L1",
            message: `Contrast cliché "不是 A，而是 B": "${m[0].slice(0, 24)}…"`,
          });
          structure++;
        }
      }
      if (ZH_NEGOPEN_RE.test(sentence)) {
        findings.push({ line: lineNo, rule: "zh-negation-opening", severity: "L2",
          message: "Negation opening (顿悟铺垫); state the point directly" });
        structure++;
      }
      let mm;
      ZH_DECHAIN_RE.lastIndex = 0;
      if ((mm = ZH_DECHAIN_RE.exec(sentence)) !== null) {
        findings.push({ line: lineNo, rule: "zh-translationese", severity: "L2",
          message: "Translationese: 的-chain (3+ 的); split the sentence" });
        structure++;
      }
      ZH_EMPTYVERB_RE.lastIndex = 0;
      if ((mm = ZH_EMPTYVERB_RE.exec(sentence)) !== null) {
        findings.push({ line: lineNo, rule: "zh-translationese", severity: "L2",
          message: `Translationese: empty verb "${mm[0]}"; use the verb directly` });
        structure++;
      }
      ZH_PREJUDGE_RE.lastIndex = 0;
      if ((mm = ZH_PREJUDGE_RE.exec(sentence)) !== null) {
        findings.push({ line: lineNo, rule: "zh-translationese", severity: "L2",
          message: `Translationese: adjective + 冒号预判 ("${mm[0]}"); drop the setup` });
        structure++;
      }
      if (sentence.includes("之一")) {
        findings.push({ line: lineNo, rule: "zh-translationese", severity: "L2",
          message: 'Translationese: overused "之一"; judge or list directly' });
        structure++;
      }
    }

    EMDASH_RE.lastIndex = 0;
    const dashes = [...stripped.matchAll(EMDASH_RE)];
    if (dashes.length > EMDASH_LIMIT) {
      for (const m of dashes.slice(EMDASH_LIMIT)) {
        const lineNo = stripped.slice(0, m.index).split("\n").length;
        findings.push({ line: lineNo, rule: "zh-em-dash", severity: "L1",
          message: `Em-dash quota exceeded: ${dashes.length} in text (limit ${EMDASH_LIMIT})` });
      }
      structure++;
    }

    findings.sort((a, b) => a.line - b.line || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0));
    return { findings, l1, l2, structure };
  }

  function analyze(text, lang = "auto") {
    const findings = [];
    let longSentences = 0, buzzwordHits = 0, hedgeHits = 0;
    let zhL1 = 0, zhL2 = 0, zhStructure = 0;

    const sentences = splitSentences(text);
    const stripped = stripFencedCode(text);
    let totalWords = 0, totalSyllables = 0, totalCjk = 0;

    for (const [sentence, lineNo] of sentences) {
      WORD_RE.lastIndex = 0;
      const words = sentence.match(WORD_RE) || [];
      CJK_RE.lastIndex = 0;
      const cjk = (sentence.match(CJK_RE) || []).length;
      totalCjk += cjk;
      const ew = words.length + cjk / 2.0;
      totalWords += words.length;
      for (const w of words) totalSyllables += countSyllables(w);

      if (ew > LONG_SENTENCE_WORDS) {
        longSentences++;
        findings.push({
          line: lineNo,
          rule: "long-sentence",
          message: cjk
            ? `Sentence has ${Math.round(ew)} effective words (limit ${LONG_SENTENCE_WORDS})`
            : `Sentence has ${words.length} words (limit ${LONG_SENTENCE_WORDS})`,
        });
      }

      const seen = new Set();
      BUZZ_RE.lastIndex = 0;
      let m;
      while ((m = BUZZ_RE.exec(sentence)) !== null) {
        const key = m[0].toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        buzzwordHits++;
        findings.push({ line: lineNo, rule: "buzzword", message: `AI-tell buzzword: "${m[0]}"` });
      }
      HEDGE_RE.lastIndex = 0;
      while ((m = HEDGE_RE.exec(sentence)) !== null) {
        hedgeHits++;
        findings.push({ line: lineNo, rule: "hedge", message: `Hedge word: "${m[0]}"` });
      }
    }

    const useZh = lang === "zh" || (lang === "auto" && CJK_TEST.test(text));
    if (useZh) {
      const z = zhFindings(text, stripped);
      zhL1 = z.l1; zhL2 = z.l2; zhStructure = z.structure;
      findings.push(...z.findings);
      findings.sort((a, b) => a.line - b.line || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0));
    }

    let readingEase;
    if (sentences.length && totalWords) {
      const avgWords = totalWords / sentences.length;
      const avgSyll = totalSyllables / totalWords;
      readingEase = pyRound(Math.max(0, Math.min(100, 206.835 - 1.015 * avgWords - 84.6 * avgSyll)), 1);
    } else {
      readingEase = 100.0;
    }

    let score = 100.0;
    score -= Math.min(20.0, 4.0 * longSentences);
    score -= Math.min(30.0, 3.0 * (buzzwordHits + zhL1));
    score -= Math.min(15.0, 5.0 * zhStructure);
    score -= Math.min(10.0, 1.0 * (hedgeHits + zhL2));
    if (readingEase < 60 && totalWords >= totalCjk) {
      score -= Math.min(25.0, (60.0 - readingEase) * 0.5);
    }
    const plainness = pyRound(Math.max(0, Math.min(100, score)));

    const grade = plainness >= 90 ? "plain"
      : plainness >= 75 ? "mostly plain"
      : plainness >= 60 ? "needs polish" : "slop";

    return {
      plainness, grade,
      stats: {
        sentences: sentences.length,
        words: totalWords,
        long_sentences: longSentences,
        buzzword_hits: buzzwordHits,
        hedge_hits: hedgeHits,
        zh_l1_hits: zhL1,
        zh_l2_hits: zhL2,
        zh_structure_hits: zhStructure,
        reading_ease: readingEase,
      },
      findings,
    };
  }

  return { analyze, splitSentences };
}

// Node / CommonJS export; browser loads via <script> tags and uses window.slopLint.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { makeEngine };
} else if (typeof window !== "undefined") {
  window.slopLint = { makeEngine };
}
