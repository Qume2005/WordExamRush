/**
 * 音效引擎 — Web Audio 合成音效，零资产零依赖
 *
 * 所有声音通过 AudioContext 实时合成，不加载任何外部音频文件。
 * AudioContext 惰性创建（首次 play 调用时），符合 autoplay 合规要求。
 * 静音状态持久化到 localStorage（key: word-exam-rush:sound-muted）。
 */

// 模块级 AudioContext，首次调用 getCtx() 时惰性创建
let ctx: AudioContext | null = null

/** 获取或创建 AudioContext，处理 webkit 前缀与 suspended 状态 */
function getCtx(): AudioContext | null {
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/**
 * 私有音调合成器
 * @param type 振荡器类型
 * @param fromFreq 起始频率 Hz
 * @param toFreq 结束频率 Hz
 * @param startMs 延迟开始 ms
 * @param durMs 持续时间 ms
 * @param peak 峰值音量 0-1
 */
function tone(
  type: OscillatorType,
  fromFreq: number,
  toFreq: number,
  startMs: number,
  durMs: number,
  peak: number
): void {
  const ac = getCtx()
  if (!ac) return
  // Chrome 在 TTS 朗读期间会静音 Web Audio：答题时单词往往还在读，
  // 音效会整段被吃掉。播音效前先掐掉朗读，并留 120ms 等音频通道释放
  if ('speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending)) {
    speechSynthesis.cancel()
    if (pendingSpeak !== null) {
      clearTimeout(pendingSpeak)
      pendingSpeak = null
    }
    startMs += 120
  }
  const t0 = ac.currentTime
  const osc = ac.createOscillator()
  osc.type = type
  const gain = ac.createGain()
  osc.connect(gain)
  gain.connect(ac.destination)
  const start = t0 + startMs / 1000
  const end = t0 + (startMs + durMs) / 1000
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(peak, start + 0.01)
  gain.gain.linearRampToValueAtTime(0.0001, end)
  osc.frequency.setValueAtTime(fromFreq, start)
  if (fromFreq !== toFreq) {
    osc.frequency.linearRampToValueAtTime(toFreq, end)
  }
  osc.start(start)
  osc.stop(end + 0.05)
}

/** 读取静音状态（惰性读 localStorage，不缓存） */
export function isMuted(): boolean {
  return localStorage.getItem('word-exam-rush:sound-muted') === '1'
}

/** 切换静音状态，写入 localStorage，返回新状态 */
export function toggleMuted(): boolean {
  const next = !isMuted()
  localStorage.setItem('word-exam-rush:sound-muted', next ? '1' : '0')
  return next
}

/** 答对音效 — 两连音，streak 越高音调越高（最多 12 个半音） */
export function playCorrect(streak: number): void {
  if (isMuted()) return
  if (!getCtx()) return
  const f = 2 ** (Math.min(streak - 1, 12) / 12)
  tone('triangle', 659.25 * f, 659.25 * f, 0, 80, 0.12)
  tone('triangle', 880 * f, 880 * f, 90, 80, 0.12)
}

/** 答错音效 — 低沉方波下滑 */
export function playWrong(): void {
  if (isMuted()) return
  if (!getCtx()) return
  tone('square', 160, 110, 0, 200, 0.08)
}

/** 跳过/未知音效 — 短促三角波 */
export function playUnknown(): void {
  if (isMuted()) return
  if (!getCtx()) return
  tone('triangle', 330, 330, 0, 100, 0.1)
}

/** 连击里程碑音效 — C5/E5/G5/C6 琶音 */
export function playComboMilestone(): void {
  if (isMuted()) return
  if (!getCtx()) return
  const notes = [523.25, 659.25, 783.99, 1046.5]
  for (let i = 0; i < notes.length; i++) {
    tone('triangle', notes[i], notes[i], i * 60, 60, 0.12)
  }
}

/** 完成音效 — G4/C5/E5/G5 上行分解和弦 */
export function playFinish(): void {
  if (isMuted()) return
  if (!getCtx()) return
  const notes = [392, 523.25, 659.25, 783.99]
  for (let i = 0; i < notes.length; i++) {
    tone('triangle', notes[i], notes[i], i * 120, 120, 0.14)
  }
}

/**
 * 单词读音 — 系统 TTS，去掉 "<英>" 类变体标记，语速 0.9 便于听清单词。
 * auto=true 为出题自动朗读（受静音控制）；手动点击始终播放。
 * 每次朗读先打断上一段再延后一拍 speak，快速切卡不叠音。
 */

// 声音列表异步加载：缓存 + voiceschanged 刷新，只注册一次监听
let cachedVoices: SpeechSynthesisVoice[] | null = null

function getVoicesCached(): SpeechSynthesisVoice[] {
  if (cachedVoices === null) {
    cachedVoices = speechSynthesis.getVoices()
    speechSynthesis.addEventListener('voiceschanged', () => {
      cachedVoices = speechSynthesis.getVoices()
    })
  }
  return cachedVoices
}

/**
 * 按质量挑英文声音。macOS 会把 Albert（老烟枪音色）、Bad News 等怪声音
 * 也报成 en-US，取列表第一个会抽中它们，所以按音色打分取最高。
 */
function pickEnVoice(): SpeechSynthesisVoice | null {
  const score = (v: SpeechSynthesisVoice): number => {
    let s = 0
    const lang = v.lang.replace('_', '-').toLowerCase()
    if (lang.startsWith('en-us')) s += 2
    else if (lang.startsWith('en')) s += 1
    if (/(enhanced|premium|natural|neural)/i.test(v.name)) s += 5
    if (/google/i.test(v.name)) s += 4
    if (/(samantha|alex|aria|jenny|guy|zira|david|mark|ava|kate|daniel)/i.test(v.name)) s += 2
    if (v.localService) s += 1
    return s
  }
  const en = getVoicesCached().filter(v => v.lang.toLowerCase().startsWith('en'))
  let best: SpeechSynthesisVoice | null = null
  for (const v of en) {
    if (best === null || score(v) > score(best)) best = v
  }
  return best
}

let pendingSpeak: ReturnType<typeof setTimeout> | null = null

export function speakWord(text: string, auto = false): void {
  if (auto && isMuted()) return
  if (!('speechSynthesis' in window)) return
  const clean = text.replace(/<[^>]*>/g, '').trim()
  if (!clean) return
  speechSynthesis.cancel()
  if (pendingSpeak !== null) clearTimeout(pendingSpeak)
  const utter = new SpeechSynthesisUtterance(clean)
  utter.lang = 'en-US'
  utter.rate = 0.9
  const voice = pickEnVoice()
  if (voice) utter.voice = voice
  // 延后一拍：cancel 与 speak 同一拍执行在部分引擎上会失效导致叠音/卡死
  pendingSpeak = setTimeout(() => {
    pendingSpeak = null
    speechSynthesis.speak(utter)
  }, 0)
}
