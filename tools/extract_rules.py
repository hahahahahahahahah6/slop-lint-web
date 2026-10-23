"""Extract word lists + regex sources from slop_lint.py into rules.json.

Run: python3 tools/extract_rules.py  (from the project root)
Reads ../.., i.e. ~/workspace/slop-lint/slop_lint.py
"""
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "slop-lint", "slop_lint.py"))

spec = importlib.util.spec_from_file_location("slop_lint", SRC)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

rules = {
    "version": mod.VERSION,
    "long_sentence_words": mod.LONG_SENTENCE_WORDS,
    "emdash_limit": mod.EMDASH_LIMIT,
    "buzzwords": mod.BUZZWORDS,
    "hedges": mod.HEDGES,
    "zh_l1_words": mod.ZH_L1_WORDS,
    "zh_l2_words": mod.ZH_L2_WORDS,
    "zh_l1_exempt": mod._ZH_L1_EXEMPT,
    "zh_openings": mod._ZH_OPENINGS,
    "zh_closings": mod._ZH_CLOSINGS,
    "zh_unsourced": mod._ZH_UNSOURCED,
    "patterns": {
        "zh_chai": mod._ZH_CHAI_RE.pattern,
        "zh_ledger": mod._ZH_LEDGER_RE.pattern,
        "zh_notbut": [p.pattern for p in mod._ZH_NOTBUT_PATTERNS],
        "zh_negopen": mod._ZH_NEGOPEN_RE.pattern,
        "zh_dechain": mod._ZH_DECHAIN_RE.pattern,
        "zh_emptyverb": mod._ZH_EMPTYVERB_RE.pattern,
        "zh_prejudge": mod._ZH_PREJUDGE_RE.pattern,
        "emdash": mod._EMDASH_RE.pattern,
        "cjk": mod._CJK_RE.pattern,
        "word": mod._WORD_RE.pattern,
        "vowel_group": mod._VOWEL_GROUP_RE.pattern,
        "bound": mod._BOUND_RE.pattern,
        "fence_start": mod._FENCE_START_RE.pattern,
        "block_start": mod._BLOCK_START_RE.pattern,
    },
}

out = os.path.join(HERE, "..", "rules.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(rules, f, ensure_ascii=False, indent=1)
print("wrote", out, "(%d bytes)" % os.path.getsize(out))
