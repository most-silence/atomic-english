#!/usr/bin/env python3
"""
用 Edge TTS（微软在线语音，免费、无需密钥）预生成课程音频。

为什么要预生成：
  Android APK 的 WebView 依赖系统 TTS 引擎，国产 ROM 常无英文语音包，
  speechSynthesis.speak() 会静默失败。预生成 mp3 作为静态资源打包进 Web/APK，
  用 <audio> 播放，彻底绕开设备 TTS；且离线可用、两端音质一致。

产出（写入 apps/web/public/audio/）：
  challenge-<id>.mp3   每道题的完整句子
  word-<word>.mp3      每个去重单词
  manifest.json        文本 -> 音频 URL 映射，供运行时 speak() 查表

用法：
  pip install edge-tts
  python scripts/generate-audio.py                 # 生成全部（跳过已存在）
  python scripts/generate-audio.py --force          # 强制重新生成
  python scripts/generate-audio.py --voice en-US-AriaNeural
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
SEED_TS = ROOT / "packages" / "domain" / "src" / "seed.ts"
OUT_DIR = ROOT / "apps" / "web" / "public" / "audio"
DEFAULT_VOICE = "en-US-AriaNeural"
# Aria 语速偏快，教学场景放慢一点，rate 形如 -10%
DEFAULT_RATE = "-10%"
CONCURRENCY = 6


def parse_seed() -> tuple[dict[int, str], list[str]]:
    """从 seed.ts 提取 id->句子 和全部去重单词（不依赖 TS 运行时）。"""
    text = SEED_TS.read_text(encoding="utf-8")
    entries = re.findall(
        r"id:\s*(\d+),[\s\S]*?sentence:\s*'([^']+)'", text
    )
    sentences: dict[int, str] = {int(i): s for i, s in entries}
    if not sentences:
        sys.exit("未从 seed.ts 解析出任何题目，检查正则或文件格式")
    words = sorted({w.lower() for s in sentences.values() for w in re.findall(r"[A-Za-z]+", s)})
    return sentences, words


async def synth(text: str, dest: Path, voice: str, rate: str, force: bool) -> bool:
    if dest.exists() and not force and dest.stat().st_size > 0:
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    try:
        await communicate.save(str(tmp))
        tmp.replace(dest)
        return True
    except Exception as exc:  # noqa: BLE001 - 脚本层，容错后继续
        print(f"  ! 生成失败 {dest.name}: {exc}", file=sys.stderr)
        tmp.unlink(missing_ok=True)
        return False


async def main_async(args: argparse.Namespace) -> None:
    sentences, words = parse_seed()
    print(f"题目 {len(sentences)} 道，去重词 {len(words)} 个，语音 {args.voice}")

    jobs: list[tuple[str, Path]] = []
    manifest: dict[str, str] = {}
    for cid, sentence in sentences.items():
        name = f"challenge-{cid}.mp3"
        jobs.append((sentence, OUT_DIR / name))
        manifest[sentence.strip().lower()] = f"/audio/{name}"
    for word in words:
        name = f"word-{word}.mp3"
        jobs.append((word, OUT_DIR / name))
        manifest[word] = f"/audio/{name}"

    sem = asyncio.Semaphore(args.concurrency)

    async def run(text: str, dest: Path) -> bool:
        async with sem:
            return await synth(text, dest, args.voice, args.rate, args.force)

    results = await asyncio.gather(*(run(t, d) for t, d in jobs))
    created = sum(1 for r in results if r)
    failed = sum(1 for d, r in zip((d for _, d in jobs), results) if r is False and not d.exists())
    print(f"新生成 {created} 个，跳过 {len(jobs) - created - failed} 个，失败 {failed} 个")

    manifest_path = OUT_DIR / "manifest.json"
    manifest_path.write_text(
        json.dumps({"voice": args.voice, "rate": args.rate, "entries": manifest}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"manifest: {manifest_path.relative_to(ROOT)} ({len(manifest)} 条)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--voice", default=DEFAULT_VOICE, help="Edge TTS 音色")
    ap.add_argument("--rate", default=DEFAULT_RATE, help="语速，如 -10%")
    ap.add_argument("--concurrency", type=int, default=CONCURRENCY)
    ap.add_argument("--force", action="store_true", help="强制重新生成已存在文件")
    asyncio.run(main_async(ap.parse_args()))


if __name__ == "__main__":
    main()
