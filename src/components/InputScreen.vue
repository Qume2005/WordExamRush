<script setup>
import { ref, computed, onMounted } from 'vue'
import { parseAndProcess } from '../business/wordProcessor'
import { resolveFileHash, ensureFileEntry, calcFilePercent, calcFileSparkline, consumeSession } from '../business/progressStorage'
import { createEmptyProgress } from '../business/quizEngine'
import SparklineChart from './SparklineChart.vue'

const emit = defineEmits(['resume-quiz', 'show-detail'])

const fileTree = ref([])
const expandedFolder = ref('')
const errorMsg = ref('')
const loading = ref(false)
const statsVersion = ref(0)
const resumePrompt = ref(null) // { folder, fileName?, files? }

// Pre-compute stats to avoid localStorage reads on every render
const fileStats = computed(() => {
  statsVersion.value // depend on version to trigger refresh
  const stats = {}
  for (const group of fileTree.value) {
    for (const f of group.files) {
      const key = `${group.folder}/${f}`
      stats[key] = {
        percent: calcFilePercent(group.folder, f),
        sparkline: calcFileSparkline(group.folder, f),
      }
    }
  }
  return stats
})

function getFolderPercent(folder, files) {
  let total = 0
  for (const f of files) {
    const s = fileStats.value[`${folder}/${f}`]
    total += s ? s.percent : 0
  }
  return files.length ? Math.round(total / files.length) : 0
}

function getFileStat(folder, file) {
  return fileStats.value[`${folder}/${file}`] || { percent: 0, sparkline: '' }
}

onMounted(async () => {
  try {
    const res = await fetch('/word_table/manifest.json')
    fileTree.value = await res.json()
  } catch {
    errorMsg.value = '无法加载单词表列表'
  }

  // Check for interrupted session
  const session = consumeSession()
  if (session) {
    resumePrompt.value = session
  }
})

function toggleFolder(folder) {
  expandedFolder.value = expandedFolder.value === folder ? '' : folder
}

async function loadFile(folder, fileName) {
  const res = await fetch(`/word_table/${folder}/${fileName}.json`)
  if (!res.ok) throw new Error('加载失败')
  const rawJson = await res.text()
  const hash = resolveFileHash(folder, fileName, rawJson)

  const data = JSON.parse(rawJson)
  const [processed, error] = parseAndProcess(data)
  if (error) throw new Error(error)

  const entry = ensureFileEntry(hash, processed)
  return { words: entry.words, progress: new Map(entry.progress), fileKey: hash }
}

function withLoading(fn) {
  return async (...args) => {
    errorMsg.value = ''
    loading.value = true
    try {
      await fn(...args)
    } catch (e) {
      errorMsg.value = e.message || '加载单词表失败'
    } finally {
      loading.value = false
      statsVersion.value++
    }
  }
}

async function _showFileDetail(folder, fileName) {
  const { words: w, progress: pm, fileKey } = await loadFile(folder, fileName)
  emit('show-detail', { words: w, progress: pm, fileKey, title: `${folder} / ${fileName}` })
}

async function _startFileQuiz(folder, fileName) {
  const { words: w, progress, fileKey } = await loadFile(folder, fileName)
  emit('resume-quiz', { words: w, progress, fileKey, session: { folder, fileName } })
}

const showFileDetail = withLoading(_showFileDetail)
const startFileQuiz = withLoading(_startFileQuiz)

async function loadFolder(folder, files) {
  const wordToFile = {}
  const allRaw = []
  const fileData = {}

  for (const f of files) {
    const res = await fetch(`/word_table/${folder}/${f}.json`)
    if (!res.ok) throw new Error('加载失败')
    const rawJson = await res.text()
    const hash = resolveFileHash(folder, f, rawJson)

    const data = JSON.parse(rawJson)
    allRaw.push(...data)

    const [processed] = parseAndProcess(data)
    for (const w of processed) {
      wordToFile[w.word.join(',')] = hash
    }

    const entry = ensureFileEntry(hash, processed)
    // Build wordKey → progress map for O(1) lookup
    const wordKeyMap = new Map()
    for (const [id, p] of entry.progress) {
      if (entry.words[id]) {
        wordKeyMap.set(entry.words[id].word.join(','), p)
      }
    }
    fileData[hash] = { entry, wordKeyMap }
  }

  const [combined, error] = parseAndProcess(allRaw)
  if (error) throw new Error(error)

  const wordSources = combined.map(w => wordToFile[w.word.join(',')] || null)

  // Build progress map from individual files' saved progress
  const progress = new Map()
  for (let i = 0; i < combined.length; i++) {
    const src = wordSources[i]
    const wordKey = combined[i].word.join(',')
    const fd = fileData[src]
    const existing = fd?.wordKeyMap.get(wordKey)
    progress.set(i, existing ? { ...existing, wordId: i } : createEmptyProgress(i))
  }

  return { words: combined, progress, fileKey: folder, wordSources }
}

async function _showFolderDetail(folder, files) {
  const { words: w, progress, fileKey, wordSources } = await loadFolder(folder, files)
  emit('show-detail', { words: w, progress, fileKey, wordSources, title: folder })
}

async function _startFolderQuiz(folder, files) {
  const { words: w, progress, fileKey, wordSources } = await loadFolder(folder, files)
  emit('resume-quiz', { words: w, progress, fileKey, wordSources, session: { folder, files } })
}

const showFolderDetail = withLoading(_showFolderDetail)
const startFolderQuiz = withLoading(_startFolderQuiz)

async function resumeSession() {
  const s = resumePrompt.value
  if (!s) return
  resumePrompt.value = null

  if (s.files) {
    await startFolderQuiz(s.folder, s.files)
  } else if (s.fileName) {
    await startFileQuiz(s.folder, s.fileName)
  }
}

function dismissResume() {
  resumePrompt.value = null
}
</script>

<template>
  <div class="input-screen">
    <h1 class="title">WordExamRush</h1>
    <p class="subtitle">选择一个单词表，开始抽查记忆</p>
    <div class="file-list">
      <div v-for="group in fileTree" :key="group.folder" class="folder-group">
        <button class="folder-btn" @click="showFolderDetail(group.folder, group.files)">
          <span class="folder-toggle" @click.stop="toggleFolder(group.folder)">{{ expandedFolder === group.folder ? '&#9660;' : '&#9654;' }}</span>
          <span class="folder-name">{{ group.folder }}</span>
          <span :class="['folder-percent', getFolderPercent(group.folder, group.files) === 100 && 'folder-percent--done']">{{ getFolderPercent(group.folder, group.files) }}%</span>
          <span class="folder-count">{{ group.files.length }} 个单词表</span>
          <span class="start-btn" @click.stop="startFolderQuiz(group.folder, group.files)" :class="{ 'start-btn--loading': loading }">背全部</span>
        </button>
        <div v-if="expandedFolder === group.folder" class="file-items">
          <button
            v-for="file in group.files"
            :key="file"
            class="file-btn"
            :disabled="loading"
            @click="showFileDetail(group.folder, file)"
          >
            <span class="file-icon">&#128196;</span>
            <span class="file-name">{{ file }}</span>
            <span class="file-sparkline">
              <SparklineChart :points="getFileStat(group.folder, file).sparkline" :width="48" :height="16" />
            </span>
            <span :class="['file-percent', getFileStat(group.folder, file).percent === 100 && 'file-percent--done']">{{ getFileStat(group.folder, file).percent }}%</span>
            <span class="start-btn start-btn--small" @click.stop="startFileQuiz(group.folder, file)" :class="{ 'start-btn--loading': loading }">开始</span>
          </button>
        </div>
      </div>
    </div>
    <p v-if="fileTree.length === 0 && !errorMsg" class="empty-msg">未找到单词表文件</p>
    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
    <div v-if="resumePrompt" class="resume-overlay" @click.self="dismissResume">
      <div class="resume-dialog">
        <p class="resume-msg">检测到未完成的测试，是否继续？</p>
        <div class="resume-actions">
          <button class="btn btn-back btn-sm" @click="dismissResume">放弃</button>
          <button class="btn btn-primary btn-sm" :disabled="loading" @click="resumeSession">继续</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-screen {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  padding: 40px 0;
}

.title {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.subtitle {
  font-size: 15px;
  color: var(--color-text-secondary);
  margin: 0;
}

.file-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.folder-group {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  overflow: hidden;
}

.folder-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border: none;
  background: var(--color-surface);
  cursor: pointer;
  font-size: 15px;
  color: var(--color-text);
  transition: background 0.15s;
}

.folder-btn:hover {
  background: var(--color-primary-light);
}

.folder-toggle {
  font-size: 11px;
  color: var(--color-text-secondary);
  width: 16px;
  text-align: center;
  cursor: pointer;
  padding: 4px;
}

.folder-toggle:hover {
  color: var(--color-primary);
}

.folder-name {
  font-weight: 600;
  flex: 1;
  text-align: left;
}

.folder-percent {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.folder-percent--done {
  color: var(--color-success);
}

.folder-count {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.file-items {
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
}

.file-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px 12px 42px;
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text);
  transition: background 0.15s;
}

.file-btn:last-child {
  border-bottom: none;
}

.file-btn:hover:not(:disabled) {
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.file-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-icon {
  font-size: 16px;
}

.file-name {
  font-weight: 500;
  flex: 1;
  text-align: left;
}

.file-sparkline {
  display: inline-flex;
  align-items: center;
  width: 52px;
  height: 20px;
}

.file-percent {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.file-percent--done {
  color: var(--color-success);
}

.start-btn {
  padding: 4px 12px;
  border: 1px solid var(--color-primary);
  border-radius: 6px;
  background: var(--color-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  white-space: nowrap;
  line-height: 1.4;
}

.start-btn:hover {
  background: #3651d4;
}

.start-btn--small {
  padding: 3px 10px;
  font-size: 11px;
}

.start-btn--loading {
  opacity: 0.5;
  pointer-events: none;
}

.empty-msg {
  color: var(--color-text-secondary);
  font-size: 14px;
  margin: 0;
}

.error-msg {
  color: var(--color-danger);
  font-size: 14px;
  margin: 0;
}

.resume-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.resume-dialog {
  background: var(--color-surface);
  border-radius: var(--radius);
  padding: 28px 32px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 360px;
  width: 90%;
}

.resume-msg {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text);
  margin: 0;
  text-align: center;
}

.resume-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn-sm {
  padding: 8px 24px;
  font-size: 14px;
}

.btn-back {
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  background: var(--color-border);
  color: var(--color-text);
  transition: background 0.2s;
}

.btn-back:hover {
  background: #cdd1d6;
}
</style>
