<script setup lang="ts">
import { computed, watch } from 'vue'
import { syncState, signIn, signOut, syncNow, type SyncStatus } from '../business/syncController'

const emit = defineEmits(['synced'])

// 业务语义视图：按状态名归类展示，避免模板里堆条件
const view = computed<'not-configured' | 'signed-out' | 'syncing' | 'signed-in' | 'error' | 'schema'>(() => {
  const s: SyncStatus = syncState.status
  if (s === 'idle-not-configured') return 'not-configured'
  if (s === 'idle-signed-out') return 'signed-out'
  if (s === 'syncing') return 'syncing'
  if (s === 'schema-unsupported') return 'schema'
  if (s === 'error') return 'error'
  return 'signed-in'
})

// 手动同步成功（syncing → idle）后通知父组件刷新统计
watch(
  () => syncState.status,
  (now, before) => {
    if (before === 'syncing' && now === 'idle') emit('synced')
  }
)

const busy = computed(() => view.value === 'syncing')
</script>

<template>
  <div class="sync-panel">
    <!-- 未配置：展示配置指引而非报错 -->
    <div v-if="view === 'not-configured'" class="sync-guide">
      <p class="sync-title">云同步未启用</p>
      <p class="sync-desc">需在 src/business/syncConfig.ts 配置 MSAL_CLIENT_ID 后启用云同步</p>
      <p class="sync-desc">配置步骤见 README「云同步（OneDrive）」章节</p>
    </div>

    <template v-else>
      <div class="sync-row">
        <span class="sync-title">云同步</span>
        <span v-if="syncState.accountEmail" class="sync-account">{{ syncState.accountEmail }}</span>

        <span v-if="view === 'syncing'" class="sync-msg">正在同步…</span>

        <template v-else-if="view === 'signed-in'">
          <button class="sync-btn" :disabled="busy" @click="syncNow('manual')">立即同步</button>
          <button class="sync-btn sync-btn--ghost" @click="signOut">退出登录</button>
        </template>

        <button v-else-if="view === 'signed-out'" class="sync-btn" :disabled="busy" @click="signIn">
          登录 OneDrive
        </button>

        <button v-else-if="view === 'error'" class="sync-btn" @click="syncNow('manual')">重试</button>
        <button v-else-if="view === 'schema'" class="sync-btn" disabled>已中止</button>
      </div>

      <p v-if="view === 'schema'" class="sync-warn">
        浏览器/应用版本过低，云端数据格式较新，已中止同步以保护数据，请升级后再试
      </p>
      <p v-else-if="view === 'error' || syncState.lastMessage" class="sync-msg">{{ syncState.lastMessage }}</p>
    </template>
  </div>
</template>

<style scoped>
.sync-panel {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  padding: 12px 16px;
}

.sync-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sync-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text);
  margin: 0;
}

.sync-desc {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 4px 0 0;
}

.sync-account {
  font-size: 13px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.sync-msg {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 6px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sync-warn {
  font-size: 13px;
  color: var(--color-danger);
  margin: 6px 0 0;
}

.sync-btn {
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

.sync-btn:hover:not(:disabled) {
  background: #3651d4;
}

.sync-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sync-btn--ghost {
  background: var(--color-surface);
  color: var(--color-text);
  border-color: var(--color-border);
}

.sync-btn--ghost:hover:not(:disabled) {
  background: var(--color-primary-light);
}

.sync-guide {
  text-align: left;
}
</style>
