#!/usr/bin/env python3
"""Build the live-panel config for the Atomic Learning architecture diagram.

The config is the single source of truth for both the README static image and
any future animated render. Geometry is authored once here and dumped to JSON.

Usage:
  python3 scripts/build-architecture-panel.py
"""
import json
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "assets", "architecture", "config.json")

# one master timeline: 6 phases x 3.5s = 21s, loops
PHASES = [
    {"t": "听写提交", "m": "web → audio/domain · 播放并判分", "g": "distill"},
    {"t": "逐词判分", "m": "domain ⇢ db · 错词进入复习队列", "g": "grade"},
    {"t": "SRS 排期", "m": "domain ⇄ db · 纯函数推算间隔", "g": "srs"},
    {"t": "埋点入队", "m": "analytics ⇢ db · 事件先落本地", "g": "track"},
    {"t": "埋点上报", "m": "analytics ⇢ api · AnalyticsSink", "g": "report"},
    {"t": "云同步",   "m": "api ⇢ Supabase · RLS 按 uid 隔离", "g": "sync"},
]

elements = []


def text(x, y, w, t, size=16, c="fg", b=False, align="left", inside=False):
    e = {"type": "text", "x": x, "y": y, "w": w, "align": align, "size": size, "t": t, "c": c}
    if b:
        e["b"] = 1
    if inside:
        e["inside"] = True
    elements.append(e)
    return e


def box(x, y, w, h, color, fill, lines, pad, phases=None, glow=None,
        radius=10, border=1.5, dash=False, container=False):
    e = {
        "type": "box", "x": x, "y": y, "w": w, "h": h,
        "color": color, "fill": fill, "pad": pad, "lines": lines,
        "radius": radius, "border": border,
    }
    if dash:
        e["dash"] = True
    if container:
        e["container"] = True
    if phases is not None:
        e["when"] = {"var": "phase.i", "in": phases}
        e["then"] = {"glow": glow or color, "border": 3.0}
    elements.append(e)
    return e


def path(points, active=None, accent="bl", color="line", width=2.2, head=10,
         dash=False, flow=True, period=2.6, offsets=None, flow_color="pk", r=0):
    e = {"type": "path", "points": points, "color": color, "width": width,
         "head": head, "r": r}
    if dash:
        e["dash"] = True
    if active is not None:
        e["when"] = {"var": "phase.i", "in": active}
        e["then"] = {"color": accent, "width": 3.6}
    if flow:
        e["flow"] = {"period": period, "offsets": offsets or [0], "color": flow_color}
    elements.append(e)
    return e


def line(x1, y1, x2, y2, color="line2", width=2.2):
    elements.append({"type": "line", "from": [x1, y1], "to": [x2, y2],
                     "color": color, "width": width})


# ---------------------------------------------------------------- title
text(100, 104, 1000, "Atomic Learning", size=58, c="ink", b=True, align="center")
text(100, 170, 1000, "架构总览 · 离线优先 / 接口先行 / 数据驱动加端",
     size=19, c="dim", align="center")
elements.append({"type": "rule", "x": 140, "y": 206, "w": 920, "c": "line2"})

# ---------------------------------------------------------- layer 1: web UI
box(340, 250, 520, 112, "bl", "blf",
    [
        {"t": "apps/web · React 19 + Vite", "size": 24, "c": "blt", "b": 1},
        {"t": "产品网页版（第一优先交付物）· SPA / PWA", "size": 15, "c": "fg"},
    ],
    pad=[50, 78, 16], phases=[0, 3, 5], glow="bl", radius=12, border=1.8)
text(382, 306, 44, "🌐", size=34, inside=True)

# ------------------------------------------------ layer 2: shared packages
PKGS = [
    # x,  color, fill,  icon, title,      package,                  sub1,                  sub2,                    active
    (70,  "gn", "gnf", "🧮", "领域逻辑", "packages/domain",       "判分 · SRS · 合并规则", "纯 TS · 零框架依赖",      [0, 1, 2]),
    (286, "or", "orf", "🔊", "音频适配", "packages/audio",        "Web Speech · 预录",     "能力探测 · 后台保活",     [0]),
    (502, "pu", "puf", "🗄", "本地真相源", "packages/db",         "Dexie · IndexedDB",     "进度 · 作答 · 事件队列",  [1, 2, 3]),
    (718, "mc", "mcf", "🔌", "可替换接口", "packages/api-client", "Auth · Sync · Sink",    "Supabase 实现只在单层",   [4, 5]),
    (934, "yl", "ylf", "📈", "埋点队列", "apps/web/src/analytics","track() 落 events 表", "登录后经 Sink 上报",      [3, 4]),
]
for x, col, fill, icon, title, pkg, sub1, sub2, active in PKGS:
    box(x, 470, 196, 176, col, fill,
        [
            {"t": title, "size": 17, "c": "ink", "b": 1, "align": "center"},
            {"t": pkg,   "size": 11.5, "c": "dim", "align": "center"},
            {"t": sub1,  "size": 13, "c": "fg", "align": "center"},
            {"t": sub2,  "size": 11.5, "c": "dim", "align": "center"},
        ],
        pad=[56, 8, 8], phases=active, glow=col, radius=10, border=1.5)
    text(x + 98, 502, 40, icon, size=26, align="center", inside=True)

# ----------------------------------------------------------- layer 3: cloud
box(410, 800, 380, 112, "tl", "tlf",
    [
        {"t": "Supabase", "size": 19, "c": "ink", "b": 1},
        {"t": "Postgres · Auth · RLS · Storage", "size": 13, "c": "fg"},
    ],
    pad=[50, 78, 16], phases=[5], glow="tl", radius=12, border=1.8)
text(452, 856, 44, "☁️", size=34, inside=True)
text(140, 952, 920, "换后端只替换 api-client 的实现 —— 业务代码与领域层不动",
     size=15, c="dim", align="center")

# --------------------------------------------------- offline / online cards
box(100, 990, 1000, 56, "gn", "wh",
    [{"t": "离线 · IndexedDB 是真相源：听写 / 判分 / 复习全在本地完成，断网照常刷题",
      "size": 15, "c": "fg"}],
    pad=[18, 22, 22], radius=9, border=1.2)

box(100, 1064, 1000, 56, "mc", "wh",
    [{"t": "在线 · api-client 把进度推到 Supabase，RLS 按 auth.uid() 隔离，多端拉回",
      "size": 15, "c": "fg"}],
    pad=[18, 22, 22], radius=9, border=1.2)

# --------------------------------------------------------------- wiring
# UI fan-out: trunk down + a shared bus, then five drops into each package.
path([[600, 362], [600, 420]], color="line", width=2.6, flow=True, period=2.2)
line(168, 420, 1032, 420, color="line2", width=2.2)

drops = [
    (168, "gn", [0], 2.6),    # -> domain
    (384, "or", [0], 2.9),    # -> audio
    (600, "pu", [3], 2.4),    # -> db
    (816, "mc", [5], 2.7),    # -> api-client
    (1032, "yl", [3], 3.1),   # -> analytics
]
for cx, accent, active, period in drops:
    path([[cx, 420], [cx, 470]], active=active, accent=accent,
         period=period, offsets=[0, period / 2])

# analytics -> api-client (short horizontal arrow, right column to its neighbour)
path([[934, 558], [916, 558]], active=[4], accent="yl", head=8,
     period=1.9, offsets=[0, 0.95])

# api-client -> Supabase (bent path, two packets while syncing)
path([[816, 646], [816, 748], [600, 748], [600, 800]],
     active=[5], accent="mc", width=2.4, head=11, period=2.8,
     offsets=[0, 1.4], r=10)

# domain -.pure function.-> db (dashed, bent under the packages row)
path([[168, 646], [168, 694], [600, 694], [600, 646]],
     active=[1, 2], accent="gn", width=1.8, head=9, dash=True,
     period=3.0, offsets=[0], flow_color="gn", r=8)
text(384, 678, 90, "纯函数 · 无副作用", size=12, c="gn", align="center")

# ------------------------------------------------------------- three rules
for x, t in [
    (70,  "● 离线优先 · 本地 IndexedDB 是真相源"),
    (430, "● 接口先行 · 外部依赖收敛在 packages/*"),
    (790, "● 数据驱动加端 · 不提前铺摊子"),
]:
    text(x, 1200, 330, t, size=13.5, c="dim")

# ------------------------------------------------------------------- log
elements.append({
    "type": "log", "x": 60, "y": 1254, "w": 1080, "rows": 4,
    "padTop": 18, "padBottom": 22, "padLeft": 24,
    "title": "数据流向 · live trace", "titleX": 40, "titleW": 210,
    "cols": [
        {"key": "time", "x": 0},
        {"key": "who",  "x": 118},
        {"key": "m",    "x": 232},
        {"key": "g",    "x": 852},
    ],
})

config = {
    "meta": {"title": "Atomic Learning · 架构总览 (light-pastel)", "lang": "zh-CN"},
    "canvas": {"preset": "4:5", "duration": 21, "fps": 30, "preroll": 0},
    "theme": {"preset": "light-pastel"},
    "clock": {"start": "09:00:00", "rate": 2},
    "credit": {
        "text": "依据 README.md §架构 与 docs/research/framework-selection.md · live-panel 动态重绘 · 状态与日志为示意",
        "y": 1444, "size": 13,
    },
    "machines": {
        "phase": {
            "type": "cycle", "period": 3.5, "t0": 0,
            "values": PHASES,
            "log": {"who": "flow", "c": "bl"},
        }
    },
    "elements": elements,
}

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(config, f, ensure_ascii=False, indent=1)
    f.write("\n")
print("wrote", os.path.abspath(OUT))
