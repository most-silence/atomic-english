#!/usr/bin/env python3
"""Native-Windows stand-in for live-panel's check_frames.py.

The reference checker uses a POSIX DevTools pipe, which cannot run on Windows.
This script builds the same self-contained page, then drives window.seek(t) and
window.__check() across a set of time points via Chrome --dump-dom, and reports
any layout problems the template itself detects.

Usage:
  python3 scripts/check-architecture-panel.py [--t 0 4 8 ...]
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

SKILL = Path("C:/Users/19456/.workbuddy/skills/live-panel")
sys.path.insert(0, str(SKILL / "scripts"))
import livepanel as lp  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CFG = ROOT / "docs" / "assets" / "architecture" / "config.json"
CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--t", nargs="+", type=float,
                    default=[0.1, 1.7, 3.4, 5.2, 7.0, 8.8, 10.5, 12.3, 14.0,
                             15.8, 17.5, 19.3, 20.9])
    a = ap.parse_args()

    tmp = Path(tempfile.mkdtemp(prefix="arch-check-"))
    page = tmp / "page.html"
    lp.build_page(str(CFG), str(page), None)

    times = json.dumps(a.t)
    probe = """
<script>
(function(){
  var times = %s, out = [], i = 0;
  function step(){
    if (i >= times.length) {
      var pre = document.createElement('pre');
      pre.id = 'LP_CHECK_RESULT';
      pre.textContent = JSON.stringify(out);
      document.documentElement.appendChild(pre);
      return;
    }
    window.seek(times[i]);
    out.push({t: times[i], problems: window.__check()});
    i++;
    setTimeout(step, 20);
  }
  var w = setInterval(function(){
    if (window.__ready) { clearInterval(w); step(); }
  }, 16);
})();
</script>
</body>
""" % times
    html = page.read_text(encoding="utf-8")
    page.write_text(html.replace("</body>", probe, 1), encoding="utf-8")

    cmd = [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
           "--allow-file-access-from-files", "--no-first-run", "--mute-audio",
           "--virtual-time-budget=20000", "--dump-dom", page.as_uri() + "?manual"]
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                       timeout=180)
    dom = r.stdout.decode("utf-8", "replace")
    m = re.search(r'<pre id="LP_CHECK_RESULT">(.*?)</pre>', dom, re.S)
    if not m:
        print("could not read check result from DOM dump")
        print(dom[-1500:])
        return 2

    import html as htmlmod
    results = json.loads(htmlmod.unescape(m.group(1)))
    total = 0
    for row in results:
        probs = row["problems"]
        total += len(probs)
        if probs:
            print("t=%s" % row["t"])
            for p in probs:
                print("  PROBLEM:", p)
    print("checked %d time points, %d problems" % (len(results), total))
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
