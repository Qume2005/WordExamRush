<script setup>
import { ref, onMounted } from 'vue'
import { parseAndProcess } from '../business/wordProcessor'
import { resolveFileHash, loadFileProgress, ensureFileEntry, calcFilePercent, calcFolderPercent } from '../business/progressStorage'

const emit = defineEmits(['start-quiz', 'resume-quiz', 'show-detail'])

const fileTree = ref([])
const expandedFolder = ref('')
const errorMsg = ref('')
const loading = ref(false)

onMounted(async () => {
  try {
    const res = await fetch('/word_table/manifest.json')
    fileTree.value = await res.json()
  } catch {
    errorMsg.value = '无法加载单词表列表'
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

  const saved = loadFileProgress(hash)
  if (saved) {
    return { words: saved.words, progress: new Map(saved.progress), fileKey: hash }
  }

  const data = JSON.parse(rawJson)
  const [processed, error] = parseAndProcess(JSON.stringify(data))
  if (error) throw new Error(error)
  return { words: processed, progress: null, fileKey: hash }
}

async function showFileDetail(folder, fileName) {
  errorMsg.value = ''
  loading.value = true
  try {
    const { words: w, progress, fileKey } = await loadFile(folder, fileName)
    const pm = progress || new Map(w.map((_, i) => [i, { wordId: i, appearances: 0, correctCount: 0, history: [] }]))
    emit('show-detail', { words: w, progress: pm, fileKey, title: `${folder} / ${fileName}` })
  } catch (e) {
    errorMsg.value = e.message || '加载单词表失败'
  } finally {
    loading.value = false
  }
}

async function startFileQuiz(folder, fileName) {
  errorMsg.value = ''
  loading.value = true
  try {
    const { words: w, progress, fileKey } = await loadFile(folder, fileName)
    if (progress) {
      emit('resume-quiz', { words: w, progress, fileKey })
    } else {
      emit('start-quiz', { words: w, fileKey })
    }
  } catch (e) {
    errorMsg.value = e.message || '加载单词表失败'
  } finally {
    loading.value = false
  }
}

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

    const [processed] = parseAndProcess(JSON.stringify(data))
    for (const w of processed) {
      wordToFile[w.word.join(',')] = hash
    }

    fileData[hash] = ensureFileEntry(hash, processed)
  }

  const [combined, error] = parseAndProcess(JSON.stringify(allRaw))
  if (error) throw new Error(error)

  const wordSources = combined.map(w => wordToFile[w.word.join(',')] || null)

  // Build progress map from individual files' saved progress
  const progress = new Map()
  for (let i = 0; i < combined.length; i++) {
    const src = wordSources[i]
    const wordKey = combined[i].word.join(',')
    const fd = fileData[src]
    let found = false
    if (fd) {
      for (const [id, p] of fd.progress) {
        if (fd.words[id] && fd.words[id].word.join(',') === wordKey) {
          progress.set(i, { ...p, wordId: i })
          found = true
          break
        }
      }
    }
    if (!found) {
      progress.set(i, { wordId: i, appearances: 0, correctCount: 0, history: [] })
    }
  }

  return { words: combined, progress, fileKey: folder, wordSources }
}

async function showFolderDetail(folder, files) {
  errorMsg.value = ''
  loading.value = true
  try {
    const { words: w, progress, fileKey, wordSources } = await loadFolder(folder, files)
    emit('show-detail', { words: w, progress, fileKey, wordSources, title: folder })
  } catch (e) {
    errorMsg.value = e.message || '加载单词表失败'
  } finally {
    loading.value = false
  }
}

async function startFolderQuiz(folder, files) {
  errorMsg.value = ''
  loading.value = true
  try {
    const { words: w, progress, fileKey, wordSources } = await loadFolder(folder, files)
    emit('resume-quiz', { words: w, progress, fileKey, wordSources })
  } catch (e) {
    errorMsg.value = e.message || '加载单词表失败'
  } finally {
    loading.value = false
  }
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
          <span :class="['folder-percent', calcFolderPercent(group.folder, group.files) === 100 && 'folder-percent--done']">{{ calcFolderPercent(group.folder, group.files) }}%</span>
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
            <span :class="['file-percent', calcFilePercent(group.folder, file) === 100 && 'file-percent--done']">{{ calcFilePercent(group.folder, file) }}%</span>
            <span class="start-btn start-btn--small" @click.stop="startFileQuiz(group.folder, file)" :class="{ 'start-btn--loading': loading }">开始</span>
          </button>
        </div>
      </div>
    </div>
    <p v-if="fileTree.length === 0 && !errorMsg" class="empty-msg">未找到单词表文件</p>
    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
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
</style>
