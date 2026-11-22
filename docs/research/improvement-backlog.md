# 后续提升清单（资料与方向）

> 用途：记录待收集的资料与待验证的改进方向。4 项方向由用户于 2026-11-21 口述整理，2026-11-22 做了补充调研。
> **状态：仅调研记录，尚未实现。** 每条含「口述原文 / 调研发现（带来源与置信度）/ 与本项目结合 / 待决项」。
> 相关笔记：[行为观察笔记](reference-behavior-notes.md)（当前判分/复习/发音机制的实现现状）。

---

## 1. 多语言学习博主与材料搜集

**口述原文**：搜集 Zoe 等 Multilanguage 博主或者学习材料。

**调研发现（置信度：高，多个独立来源交叉确认）**

- **Zoe.languages**：中文为母语的多语者，据报道会中、英、法、德、阿拉伯、土耳其、波斯等 7 门语言，人类学博士背景，频道 4600 万+ 观看；主打「如何学语言」的方法论视频与所掌握语言概览。
  - YouTube：https://www.youtube.com/@zoe.languages ｜ B 站：ZoeLanguages（space.bilibili.com/3493110222948734）
  - 有一期中文视频《7 门语言博主超详细干货分享》，时间轴覆盖：建立学习体系 → 搜索与筛选学习资料 → 筹备学习工具 → 设定现实可行的计划 → 培养习惯 → 管理心态。另有付费课《大人的语言学习课》。
  - 来源：journaly.com/post/42808、schoolhouse.world/blog/how-to-learn-a-language、famousbirthdays.com/people/zoe-languages.html、clipzui 视频页。
- **同类可搜集的多语/语言学习博主**（同一批来源推荐）：Ari no Yume（英法日中俄）、Tanya Benavente（希腊/意/西，语言 planner 方法）、Potatoglot（日韩为主）、Xiaomanyc、Thelinguist、LingoSteve。聚合推荐列表见 Journaly 与 Schoolhouse 两篇文章。

**与本项目结合**：其「体系→资料筛选→工具→计划→习惯→心态」结构可作为产品「学习方法」内容/引导文案的参考框架；方法论视频（尤其筛选资料与计划部分）值得逐条拆解成笔记。注意借鉴组织方式，不复用其课程原文/视频素材。

**待决项**：是否逐条精看 Zoe 的方法论视频并产出结构化笔记；是否建立「参考博主清单」持续维护。

## 2. 美式英语发音（弱读、连读）与词组单元记忆

**口述原文**：美式英语，弱读、连读发音，词组为单元记忆。

**调研发现（置信度：高，语言学教学资料与研究综述一致）**

- **Connected speech（连贯语流）五大现象**（British Council TeachingEnglish、RMIT 大学整理）：
  1. Linking / catenation 连读：辅音结尾 + 元音开头相连（`turn off`→`tur-noff`）。
  2. Intrusion 加音：元音+元音之间插入 /w/ /j/ /r/（`go out`→`go-wout`，`law and order`→ 侵入 r）。
  3. Elision 省音：/t/ /d/ 在辅音簇中消失（`next day`→`nex day`，`must be`→`mus be`）。
  4. Assimilation 同化：`did you`→`di-ju`，`don't you`→`don-chu`。
  5. Weak forms 弱读：功能词弱读，`to`→`tə/ta`，`I am going to`→`gonna`，`want to`→`wanna`，`could have`→`coulda`，`let me`→`lemme`。
- **美式特点**：相比英式，美式连读更平滑、弱化更强；元音间的 /t/ 常软化（flapping，`better` 听感近 `bedder`）。连读在慢速语流也存在，只是强弱不同。
- **词组/词块记忆（lexical chunking）有强研究支撑**：Pawley & Syder (1983) 认为预制语块是流利连贯言语的主要构建块；Lewis (1993) 词汇法主张语言由多词块构成而非语法填空；Erman & Warren (2000) 统计自然语言约 50–80% 为公式化语块；Boers et al. (2006) 对照实验显示词块教学组流利度显著更高；Jiang & Nekrasova (2007) 发现词块比等长非词块识别更快更准；2022 研究再次验证词块训练提升中介语流利度。机制：整体提取一个语块可绕过逐词组装的认知负荷（Conklin & Schmitt 2012）。
  - 来源：Cambridge ELT《Learning language in chunks》PDF、gianfrancoconti.com 研究综述、5minuteenglish.com、casipe.net。
- **练习法**：shadowing（影子跟读，边听边同步复述、模仿节奏连读）、transcription（听写还原）、spot-the-linking、录音对比原声——与本产品「听一句立刻复述」的核心动作天然契合。

**与本项目结合**：这是 4 项里对产品影响最深的。当前判分是**精确词匹配**（`start ≠ started`，不做词干归一）、听写单位是**句**、复习抽**词级实词**——与「连读/弱读 + 词组为单元」冲突：
- 判分层：连读/弱读会让「听到的音」与「拼写的词」脱节，需引入归一（如 `gonna`↔`going to`）或模糊匹配，且必须防假判据（参见行为观察笔记的判分纪律）。
- 内容层：题库可从「整句」扩展到「词块/搭配」，复习词条从单词升级为词组。
- 音频层：发音示范要体现连读弱读，而非逐词朗读（见第 3 项）。

**待决项**：先做可验证的 spike——挑 5–10 组核心减缩（`gonna/wanna/coulda/dija...`）做归一判分原型，验证不会误判；再决定是否重构题库数据模型。

## 3. 切换音源

**口述原文**：切换音源。

**调研发现（置信度：高，MDN 与多篇 2026 开发者指南一致）**

- **Web Speech API 原生能力**：`speechSynthesis.getVoices()` 返回设备暴露的音色列表；每个 `SpeechSynthesisVoice` 有 `name / lang / localService / default / voiceURI`。音色目录由 OS 决定：Windows→微软语音、macOS→Apple 语音、Android→Google 引擎；Chrome/Edge 列最多，Safari 少而精，Firefox 往往很少。
- **关键坑**：音色列表**异步加载**，首调常返回空数组，必须监听 `voiceschanged` 事件（React 中 `useEffect` 内既立即调一次又监听事件）。
- **选音色实践**：不要硬编码音色名（跨设备不一致），按 `voice.lang` 过滤（如 `en-US` / `en-GB`）再回退默认；优先带 Natural/Neural/Siri/Google 标签的音色；`localService=true` 为本地（离线可用、延迟低），`false` 为云音色（更自然但需联网、有首字延迟与隐私考量）。
- **参数**：`rate` 0.85（校对）/ 1.0（正常）/ 1.4（略读）；`pitch` 极端会糊；`boundary` 事件可做逐词卡拉OK高亮，但 Chrome 可靠、Safari/Firefox 不稳。长句（>200 字符）在移动浏览器可能被截断，需切片。
- 来源：MDN《Using the Web Speech API》、andrewusher.dev、qtool.io、fiftygpt.com、onlinehandytools.com（2026 Web Speech API 指南）。

**与本项目结合**：项目已有 `packages/audio`（types/platform/capabilities/webSpeech/keepAlive/htmlAudio），且约定 `speak()` 对外签名不变。切换音源可做成两层：① Web Speech 层加音色选择（按 lang 过滤 + 用户偏好持久化）；② 预录真人音频走 htmlAudio + Cache API 的既有通路——后者才是真正解决「连读弱读示范」的根本方案。

**待决项**：音色选择 UI 放哪（设置页 vs 播放器旁）；是否需要引入云端 TTS（会带来 key/隐私/成本，与当前离线优先冲突，倾向不引入，优先真人预录音源）。

## 4. 使用「玟火 SKILL」训练英语资料

**口述原文**：使用玟火 SKILL 训练英语资料。

**调研发现（置信度：低，名称待用户确认）**

- 公开搜索「玟火 skill」无有意义结果；本地已安装技能目录、技能市场、历史对话检索均无「玟火」相关信息。怀疑是拼写或语音识别误差（可能是某个具体 skill/产品名）。
- 技能市场检索到三个**可能相关但名称不同**的可安装候选（仅列出，**未安装**）：
  - `英语学习助手`（english-learning-assistant）：零基础到听说读写，覆盖音标拼读、词汇记忆、语法、四项训练、备考、方法论、计划管理。
  - `课程构建器`（course-builder）：把资料做成体系化课程、题库与练习详解。
  - `学习规划师`（study-planner）：目标+截止日+时长→分阶段计划与打卡。

**与本项目结合**：若确指上面某个 skill，可用于批量生成/训练英语学习资料（词块、练习题、学习路径），作为题库扩容与内容生产的辅助；但生成内容需经人工校对，且判分仍走项目自有引擎，不能绕过验证纪律。

**待决项（需向用户确认）**：「玟火」的确切名称/拼写与来源链接；是否指上述某个候选 skill，或外部平台的某个工具。确认前不安装、不假定。

---

_以上 4 项为待办方向；本次为初步案头调研（公开资料 + 技能/历史检索），未做真人实测或代码验证，实现另起任务。_
