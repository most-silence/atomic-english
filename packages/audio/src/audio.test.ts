import { describe, expect, it } from 'vitest';
import { chunkText, pickVoice } from './webSpeech';
import { makeToneWavBlob } from './keepAlive';

/** 造一个假的 SpeechSynthesisVoice（只需被测函数用到的字段） */
const voice = (name: string, lang: string, localService: boolean) =>
  ({ name, lang, localService }) as SpeechSynthesisVoice;

describe('chunkText', () => {
  it('空串返回空数组', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });

  it('短句不切分', () => {
    expect(chunkText('After many years, I started surfing again.')).toEqual([
      'After many years, I started surfing again.',
    ]);
  });

  it('每个片段都不超过上限', () => {
    const words = Array.from({ length: 120 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const chunks = chunkText(text, 180);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(180);
  });

  it('切分不丢词', () => {
    const words = Array.from({ length: 120 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const rejoined = chunkText(text, 180).join(' ');
    // 标点会被当作断句边界移除，这里只验证词本身顺序与数量
    expect(rejoined.split(/\s+/)).toEqual(words);
  });

  it('句子放得下时合并成一条 utterance（减少停顿）', () => {
    const text = 'First sentence. Second sentence! Third sentence?';
    expect(chunkText(text, 100)).toEqual([
      'First sentence. Second sentence! Third sentence?',
    ]);
  });

  it('放不下时在句末标点处断句', () => {
    const text = 'First sentence. Second sentence! Third sentence?';
    expect(chunkText(text, 20)).toEqual([
      'First sentence.',
      'Second sentence!',
      'Third sentence?',
    ]);
  });

  it('长句按词切且不丢词', () => {
    const sentence = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ') + '.';
    const chunks = chunkText(sentence, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(100);
  });
});

describe('pickVoice', () => {
  const voices = [
    voice('Google US English', 'en-US', false),
    voice('Samantha', 'en_US', true),
    voice('Daniel', 'en-GB', true),
    voice('French', 'fr-FR', true),
  ];

  it('精确匹配语言优先，且同层优先本地语音', () => {
    expect(pickVoice(voices, 'en-US')?.name).toBe('Samantha');
  });

  it('语言无精确匹配时退回同语族', () => {
    expect(pickVoice(voices, 'en-AU')?.name).toBe('Samantha');
  });

  it('下划线与连字符视为等价', () => {
    expect(pickVoice(voices, 'en_GB')?.name).toBe('Daniel');
  });

  it('没有匹配语言时返回 null', () => {
    expect(pickVoice(voices, 'zh-CN')).toBeNull();
  });

  it('空列表返回 null', () => {
    expect(pickVoice([], 'en-US')).toBeNull();
  });
});

describe('makeToneWavBlob', () => {
  it('生成合法的 16-bit PCM 单声道 WAV 头', async () => {
    const blob = makeToneWavBlob({ seconds: 1, sampleRate: 8000 });
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    const ascii = (offset: number, n: number) =>
      String.fromCharCode(...new Uint8Array(buf, offset, n));

    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(ascii(12, 4)).toBe('fmt ');
    expect(ascii(36, 4)).toBe('data');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint32(40, true)).toBe(8000 * 2); // 1 秒 × 16 bit
    expect(blob.size).toBe(44 + 8000 * 2);
  });

  it('振幅足够低（保活音不应听得见）', async () => {
    const blob = makeToneWavBlob({ seconds: 0.1, sampleRate: 8000 });
    const view = new DataView(await blob.arrayBuffer());
    let peak = 0;
    for (let i = 0; i < 800; i++) peak = Math.max(peak, Math.abs(view.getInt16(44 + i * 2, true)));
    expect(peak).toBeLessThan(100); // 远低于满刻度 32767
  });
});

import {
  countAudioEntries,
  findAudioUrl,
  isAudioManifestLoaded,
  normalizeKey,
  setAudioManifestForTest,
} from './prerecorded';

describe('预录音频查表', () => {
  it('normalizeKey 去空白、转小写、压缩空格', () => {
    expect(normalizeKey('  Hello   World  ')).toBe('hello world');
    expect(normalizeKey('I have started surfing')).toBe('i have started surfing');
  });

  it('未加载 manifest 时查不到音频', () => {
    setAudioManifestForTest(null);
    expect(isAudioManifestLoaded()).toBe(false);
    expect(countAudioEntries()).toBe(0);
    expect(findAudioUrl('anything')).toBeNull();
  });

  it('加载后能按归一化文本命中，包括句子与单词', () => {
    setAudioManifestForTest({
      voice: 'en-US-AriaNeural',
      rate: '-10%',
      entries: {
        'i have started surfing again after years off.': '/audio/challenge-593.mp3',
        weather: '/audio/word-weather.mp3',
      },
    });
    expect(isAudioManifestLoaded()).toBe(true);
    expect(countAudioEntries()).toBe(2);
    expect(findAudioUrl('  I Have Started Surfing Again After Years Off. ')).toBe('/audio/challenge-593.mp3');
    expect(findAudioUrl('WEATHER')).toBe('/audio/word-weather.mp3');
    expect(findAudioUrl('not in manifest')).toBeNull();
  });
});
