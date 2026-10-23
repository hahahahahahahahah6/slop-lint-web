"""Generate test/samples.json: 12 texts + expected results from the Python engine."""
import importlib.util
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "slop-lint", "slop_lint.py"))

spec = importlib.util.spec_from_file_location("slop_lint", SRC)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

SAMPLES = [
    ("en-slop",
     "Furthermore, in today's fast-paced landscape, it is crucial to leverage "
     "cutting-edge paradigms. Moreover, one might arguably say that the robust "
     "tapestry of seamless synergy could potentially unlock the potential of "
     "holistic, state-of-the-art solutions, and this comprehensive deep dive "
     "will meticulously unpack the multifaceted dynamics at play in a manner "
     "that is nothing short of revolutionary and truly game-changing for all "
     "stakeholders involved in this ever-evolving journey."),
    ("en-plain",
     "The tool checks text and flags AI-sounding phrases. Paste your draft. "
     "It scores plainness from 0 to 100."),
    ("zh-slop",
     "说白了，这个方案能赋能业务，实现降本增效，打造技术底座，形成全生命周期闭环。"
     "这不是运气，而是实力——抓手要打通，对齐要拉通，沉淀要到位——未来可期。"
     "研究表明，成功的关键之一在于执行。"),
    ("zh-plain",
     "我拆了它的客户端，想看看实现。把纸箱拆包，把零件拆散重装。"
     "这笔账单已经结清，账号里还有余额。"),
    ("mixed",
     "Furthermore, we need to leverage synergy. 说白了，这个闭环必须打通。"
     "The results are robust and comprehensive."),
    ("empty", ""),
    ("code-fence",
     "Here is the code:\n```python\ndef leverage(x):\n    # furthermore, robust tapestry\n    return x\n```\nThat is all."),
    ("markdown",
     "# Title\n\n- Furthermore, leverage the robust paradigm.\n- Short one.\n\n"
     "> A quote about synergy.\n\nPlain tail."),
    ("zh-dechain",
     "这是关于项目管理的的讨论的的总结，涉及范围的的控制。"),
    ("zh-negopen",
     "不是我不努力，而是方法不对。没有捷径，而是要持续投入。"),
    ("zh-long",
     "这个为了应对当前复杂多变的市场环境而制定出来的综合性战略规划方案，"
     "经过了多个部门长达数月的反复讨论和修改，终于在昨天正式对外发布了。"),
    ("zh-unsourced",
     "数据显示，八成用户更喜欢短句。有评论认为，长句正在消失。"),
]

out = []
for name, text in SAMPLES:
    result = mod.analyze(text)
    out.append({"name": name, "text": text, "expected": result})

path = os.path.join(HERE, "samples.json")
with open(path, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("wrote", path, "(%d samples)" % len(out))
