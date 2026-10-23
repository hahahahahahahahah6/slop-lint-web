/* Consistency tests: JS engine vs Python golden outputs.
 * Run: node test/run.js   (from the project root)
 * Pass criteria: plainness identical, stats identical, and the multiset of
 * (rule, severity) findings identical for every sample.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const RULES = JSON.parse(fs.readFileSync(path.join(ROOT, "rules.json"), "utf8"));
const { makeEngine } = require(path.join(ROOT, "slop.js"));
const { analyze } = makeEngine(RULES);
const samples = JSON.parse(fs.readFileSync(path.join(__dirname, "samples.json"), "utf8"));

function sig(findings) {
  return findings.map((f) => `${f.rule}|${f.severity || ""}`).sort().join(";");
}

let pass = 0;
for (const s of samples) {
  const got = analyze(s.text);
  const exp = s.expected;
  try {
    assert.strictEqual(got.plainness, exp.plainness, "plainness");
    assert.deepStrictEqual(got.stats, exp.stats, "stats");
    assert.strictEqual(got.grade, exp.grade, "grade");
    assert.strictEqual(sig(got.findings), sig(exp.findings), "findings");
    pass++;
    console.log(`ok   ${s.name} (plainness=${got.plainness}, findings=${got.findings.length})`);
  } catch (e) {
    console.error(`FAIL ${s.name}: ${e.message}`);
    if (sig(got.findings) !== sig(exp.findings)) {
      console.error("  got: " + sig(got.findings));
      console.error("  exp: " + sig(exp.findings));
    }
    if (JSON.stringify(got.stats) !== JSON.stringify(exp.stats)) {
      console.error("  got stats: " + JSON.stringify(got.stats));
      console.error("  exp stats: " + JSON.stringify(exp.stats));
    }
    process.exitCode = 1;
  }
}
console.log(`\n${pass}/${samples.length} samples match the Python engine.`);
