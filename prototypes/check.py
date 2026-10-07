# -*- coding: utf-8 -*-
"""check.py —— 原型自检（防回归）

这五条守的是「原型还能不能干净地转成 .ttml/.ttss」。
任何一条失败，说明原型已经偏离了可移植的结构，改起来会越来越贵。

跑法：  python check.py
退出码：0 = 全过；1 = 有失败项

为什么是脚本而不是 grep：注释里会说明换算规则（例如「本原型里 1px 等于一个
小程序单位」），纯 grep 分不清「注释里提了一句」和「真的把单位写错了」。
所以这里先把注释剥掉再检查。
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

CSS_JS_COMMENT = re.compile(r"/\*.*?\*/", re.S)
HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)
LINE_COMMENT = re.compile(r"^\s*//.*$", re.M)


def strip_comments(text, is_html=False):
    text = CSS_JS_COMMENT.sub("", text)
    text = LINE_COMMENT.sub("", text)
    if is_html:
        text = HTML_COMMENT.sub("", text)
    return text


def walk(exts):
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules")]
        for fn in sorted(filenames):
            if os.path.splitext(fn)[1].lower() in exts:
                yield os.path.join(dirpath, fn)


def rel(p):
    return os.path.relpath(p, ROOT).replace("\\", "/")


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))


# ---- 1. 引擎里不得出现关卡语义 ----------------------------------------
# 守住「新增关卡不改代码只加数据」这条声明。引擎一旦认识某个具体关卡，
# 这个声明当场失效。
FORBIDDEN_IN_ENGINE = ["rocket", "meteor", "点火", "陨石", "月球", "levelId ==="]
p = os.path.join(ROOT, "js", "interaction.js")
src = strip_comments(read(p)) if os.path.exists(p) else ""
hits = [w for w in FORBIDDEN_IN_ENGINE if w.lower() in src.lower()]
check("引擎不含关卡语义", not hits,
      "命中 %s" % hits if hits else "interaction.js 干净")

# ---- 2. 不得把 rpx 当单位使用 ------------------------------------------
# 原型统一用 px（数值上等于小程序的 rpx），转换时才整体替换成 rpx。
# 原型里混入 rpx 会让转换出现两种单位，必错。
bad = []
for p in walk({".css", ".html"}):
    src = strip_comments(read(p), is_html=p.endswith(".html"))
    for m in re.finditer(r"\d+rpx", src):
        bad.append("%s: %s" % (rel(p), m.group(0)))
check("未把 rpx 当单位使用", not bad, "; ".join(bad) if bad else "0 处")

# ---- 3. 不得有 file:// 下会失败的加载方式 ------------------------------
# 守住「双击就能打开」。fetch / XHR / ES module 在 file:// 下都会被浏览器拦住。
#
# 只检查【真正被浏览器加载的文件】：HTML 本身 + HTML 里 <script src> 引用的 JS。
# test_engine.js 是 Node 跑的测试脚本（用 require 很正常），不在检查范围。
BAD_LOAD = [r"fetch\s*\(", r"XMLHttpRequest", r'type\s*=\s*"module"', r"\brequire\s*\("]
browser_files = set(walk({".html"}))
for p in walk({".html"}):
    for m in re.finditer(r'<script[^>]+src="([^"]+)"', read(p)):
        browser_files.add(os.path.normpath(os.path.join(os.path.dirname(p), m.group(1))))

bad = []
for p in sorted(browser_files):
    if not os.path.exists(p):
        bad.append("%s: 引用的脚本不存在" % rel(p))
        continue
    src = strip_comments(read(p), is_html=p.endswith(".html"))
    for pat in BAD_LOAD:
        if re.search(pat, src):
            bad.append("%s: %s" % (rel(p), pat))
check("无 file:// 下会失败的加载", not bad, "; ".join(bad) if bad else
      "0 处（检查了 %d 个被页面引用的文件）" % len(browser_files))

# ---- 4. 不得使用会破坏转换或小程序不支持的特性 -------------------------
# rem / vw / grid / gap / calc 会打乱 px→rpx 的机械替换；
# @media 在小程序里语义不同；clamp() 支持度不稳。
BAD_CSS = [r"\brem\b", r"\dvw", r"display\s*:\s*grid", r"\bgap\s*:", r"@media", r"clamp\s*\(", r"calc\s*\("]
bad = []
for p in walk({".css"}):
    src = strip_comments(read(p))
    for pat in BAD_CSS:
        for m in re.finditer(pat, src):
            bad.append("%s: %s" % (rel(p), m.group(0).strip()))
check("无破坏转换的 CSS 特性", not bad, "; ".join(bad) if bad else "0 处")

# ---- 5. 硬编码色值不得回流 --------------------------------------------
# 颜色只许定义在 tokens.css。一旦在别处手写 #fff，主题切换就失灵了
# ——而且是那种「换个页面才发现某个角落没变色」的失灵。
COLOR = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\s*\(")
bad = []
for p in walk({".css"}):
    if os.path.basename(p) == "tokens.css":
        continue
    src = strip_comments(read(p))
    for m in COLOR.finditer(src):
        line = src[: m.start()].count("\n") + 1
        bad.append("%s:%d %s" % (rel(p), line, m.group(0)))
check("颜色只出现在 tokens.css", not bad, "; ".join(bad) if bad else "0 处")

# ---- 汇总 -------------------------------------------------------------
print("原型自检 · %s" % ROOT)
print("-" * 58)
failed = 0
for name, ok, detail in results:
    print("  %s  %-24s %s" % ("[OK]  " if ok else "[FAIL]", name, detail))
    if not ok:
        failed += 1
print("-" * 58)
print("共 %d 项，%s" % (len(results), "全部通过" if failed == 0 else "%d 项失败" % failed))
sys.exit(1 if failed else 0)
