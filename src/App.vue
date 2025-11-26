<script setup lang="ts">
import { computed, ref } from 'vue'
import type { LearningResult, Word, WordWithWeight } from './types/word'

// 应用状态
const currentView = ref<'home' | 'learning' | 'result'>('home')

// 单词库管理
const jsonInput = ref('')
const wordList = ref<WordWithWeight[]>([])
const errorMessage = ref('')
const successMessage = ref('')

// 学习流程控制
computed(() => currentView.value === 'learning')
const canStartLearning = computed(() => wordList.value.length > 0)

// 词卡交互
const currentWord = ref<WordWithWeight | null>(null)
const isCardFlipped = ref(false)

// 学习结果
const learningResults = ref<LearningResult[]>([])

// 添加单词数据
const addWords = () => {
  errorMessage.value = ''
  successMessage.value = ''

  let parsedWords: Word[]
  try {
    parsedWords = JSON.parse(jsonInput.value)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '解析JSON数据失败'
    return
  }

  // 验证单词数据格式
  if (!Array.isArray(parsedWords)) {
    throw new Error('输入的JSON数据必须是数组格式')
  }

  // 验证每个单词的格式
  parsedWords.forEach((word, index) => {
    if (!word.word) {
      throw new Error(`第${index + 1}个单词缺少有效的word字段`)
    }
    if (!word.part_of_speech) {
      throw new Error(`第${index + 1}个单词缺少有效的part_of_speech字段`)
    }
    if (!Array.isArray(word.explanation) || word.explanation.length === 0) {
      throw new Error(`第${index + 1}个单词缺少有效的explanation数组`)
    }

    // 验证每个explanation包含词性信息
    word.explanation.forEach((exp, expIndex) => {
      if (exp.length === 0) {
        throw new Error(`第${index + 1}个单词的第${expIndex + 1}个释义无效`)
      }
    })
  })

  // 将新单词添加到单词库中
  const newWordsWithWeight = parsedWords.map((word) => ({
    ...word,
    weight: 1.0,
    occurrences: 0,
    totalWeight: 0,
  }))

  wordList.value = [...wordList.value, ...newWordsWithWeight]
  successMessage.value = `成功添加了${newWordsWithWeight.length}个单词`
  jsonInput.value = ''
}

// 开始学习
const startLearning = () => {
  if (wordList.value.length === 0) return

  // 重置学习结果
  learningResults.value = []

  // 切换到学习界面
  currentView.value = 'learning'

  // 选择第一个单词
  selectNextWord()
}

// 蒙特卡洛算法根据单词权重进行选词
const selectNextWord = () => {
  // 过滤掉权重小于0.1的单词
  const eligibleWords = wordList.value.filter((word) => word.weight >= 0.1)

  if (eligibleWords.length === 0) {
    // 所有单词都已掌握，结束学习
    endLearning()
    return
  }

  // 计算总权重
  const totalWeight = eligibleWords.reduce((sum, word) => sum + word.weight, 0)

  // 生成随机数
  const random = Math.random() * totalWeight

  // 选择单词
  let cumulativeWeight = 0
  let selectedWord: WordWithWeight | null = null

  for (const word of eligibleWords) {
    cumulativeWeight += word.weight
    if (random <= cumulativeWeight) {
      selectedWord = word
      break
    }
  }

  if (selectedWord) {
    currentWord.value = selectedWord
    isCardFlipped.value = false
  } else if (eligibleWords.length > 0) {
    // 如果没有选中单词，选择第一个符合条件的单词
    currentWord.value = eligibleWords[0] || null
    isCardFlipped.value = false
  }
}

// 处理词卡翻转
const flipCard = () => {
  if (!currentWord.value) return
  isCardFlipped.value = !isCardFlipped.value
}

// 更新单词权重
const updateWordWeight = (action: 'unknown' | 'vague' | 'known') => {
  if (!currentWord.value) return

  // 更新单词权重
  switch (action) {
    case 'unknown':
      currentWord.value.weight *= 2.16
      break
    case 'vague':
      // 权重保持不变
      break
    case 'known':
      currentWord.value.weight /= 2.16
      break
  }

  // 更新出现次数和总权重
  currentWord.value.occurrences++
  currentWord.value.totalWeight += currentWord.value.weight

  // 重置词卡状态
  isCardFlipped.value = false

  // 选择下一个单词
  selectNextWord()
}

// 提前结束学习
const endLearningEarly = () => {
  endLearning()
}

// 结束学习，进入结算界面
const endLearning = () => {
  // 计算学习结果

  learningResults.value = wordList.value
    .filter((word) => word.occurrences > 0)
    .map((word) => {
      const unfamiliarity = word.totalWeight / word.occurrences
      return {
        word: word.word,
        unfamiliarity,
        occurrences: word.occurrences,
        totalWeight: word.totalWeight,
      }
    })
    // 按unfamiliarity从高到低排序
    .sort((a, b) => b.unfamiliarity - a.unfamiliarity)
  currentView.value = 'result'
}

// 返回首页
const backToHome = () => {
  currentView.value = 'home'
}

// 重新开始学习
const restartLearning = () => {
  // 重置所有单词的权重、出现次数和总权重
  wordList.value.forEach((word) => {
    word.weight = 1.0
    word.occurrences = 0
    word.totalWeight = 0
  })

  // 清空学习结果
  learningResults.value = []

  // 开始学习
  startLearning()
}
</script>

<template>
  <div id="app" class="min-h-screen bg-gray-100 p-4 md:p-8">
    <div class="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
      <!-- 首页 -->
      <div v-if="currentView === 'home'">
        <h1 class="text-3xl font-bold text-center mb-6 text-gray-800">背单词小程序</h1>

        <!-- 单词数据输入区域 -->
        <div class="mb-6">
          <h2 class="text-xl font-semibold mb-2 text-gray-700">输入单词数据（JSON格式）</h2>
          <textarea
            v-model="jsonInput"
            placeholder='[{"word": "apple", "part_of_speech": "n.", "explanation": ["苹果 n."]}, ...]'
            class="w-full h-40 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          ></textarea>

          <!-- 错误提示 -->
          <p v-if="errorMessage" class="text-red-500 mt-2">{{ errorMessage }}</p>
          <!-- 成功提示 -->
          <p v-if="successMessage" class="text-green-500 mt-2">{{ successMessage }}</p>

          <!-- 添加按钮 -->
          <button
            @click="addWords"
            class="mt-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            添加单词
          </button>
        </div>

        <!-- 开始学习按钮 -->
        <div class="mb-6">
          <button
            @click="startLearning"
            :disabled="!canStartLearning"
            :class="[
              'w-full py-3 font-bold rounded-lg transition-colors',
              canStartLearning
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed',
            ]"
          >
            开始学习
          </button>
        </div>

        <!-- 单词库列表 -->
        <div v-if="wordList.length > 0" class="mt-8">
          <h2 class="text-xl font-semibold mb-4 text-gray-700">
            当前单词库（{{ wordList.length }}个单词）
          </h2>
          <div class="overflow-x-auto">
            <table class="w-full border-collapse">
              <thead>
                <tr class="bg-gray-100">
                  <th class="border border-gray-300 px-4 py-2 text-left">单词</th>
                  <th class="border border-gray-300 px-4 py-2 text-left">词性</th>
                  <th class="border border-gray-300 px-4 py-2 text-left">释义</th>
                  <th class="border border-gray-300 px-4 py-2 text-left">权重</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(word, index) in wordList" :key="index" class="hover:bg-gray-50">
                  <td class="border border-gray-300 px-4 py-2">{{ word.word }}</td>
                  <td class="border border-gray-300 px-4 py-2">{{ word.part_of_speech }}</td>
                  <td class="border border-gray-300 px-4 py-2">
                    <ul class="list-disc list-inside">
                      <li v-for="(exp, expIndex) in word.explanation" :key="expIndex">{{ exp }}</li>
                    </ul>
                  </td>
                  <td class="border border-gray-300 px-4 py-2">{{ word.weight.toFixed(2) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 学习界面 -->
      <div v-else-if="currentView === 'learning'">
        <div class="flex justify-between items-center mb-6">
          <h1 class="text-2xl font-bold text-gray-800">背单词</h1>
          <button
            @click="endLearningEarly"
            class="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            提前结束
          </button>
        </div>

        <!-- 词卡 -->
        <div v-if="currentWord" class="flex flex-col items-center justify-center">
          <div
            @click="flipCard"
            class="w-full max-w-md bg-white border-2 border-gray-300 rounded-xl shadow-lg p-8 cursor-pointer mb-6 transition-all hover:shadow-xl"
          >
            <!-- 词卡正面（初始状态） -->
            <div v-if="!isCardFlipped" class="text-center">
              <h2 class="text-4xl font-bold text-gray-800 mb-2">{{ currentWord.word }}</h2>
              <p class="text-xl text-gray-600">{{ currentWord.part_of_speech }}</p>
            </div>

            <!-- 词卡背面（翻转后） -->
            <div v-else class="text-center">
              <h2 class="text-3xl font-bold text-gray-800 mb-2">{{ currentWord.word }}</h2>
              <p class="text-lg text-gray-600 mb-4">{{ currentWord.part_of_speech }}</p>
              <div class="mb-6">
                <h3 class="text-lg font-semibold text-gray-700 mb-2">释义：</h3>
                <ul class="list-disc list-inside text-left">
                  <li
                    v-for="(exp, index) in currentWord.explanation"
                    :key="index"
                    class="text-gray-600 mb-1"
                  >
                    {{ exp }}
                  </li>
                </ul>
              </div>

              <!-- 操作按钮 -->
              <div class="flex justify-center gap-4">
                <button
                  @click.stop="updateWordWeight('unknown')"
                  class="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  不知道
                </button>
                <button
                  @click.stop="updateWordWeight('vague')"
                  class="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  模糊
                </button>
                <button
                  @click.stop="updateWordWeight('known')"
                  class="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  知道
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 学习结果界面 -->
      <div v-else-if="currentView === 'result'">
        <div class="flex justify-between items-center mb-6">
          <h1 class="text-2xl font-bold text-gray-800">学习结果</h1>
          <button
            @click="backToHome"
            class="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            返回首页
          </button>
        </div>

        <div class="mb-6">
          <h2 class="text-xl font-semibold mb-4 text-gray-700">学习统计</h2>
          <p class="text-gray-600 mb-2">共学习了 {{ learningResults.length }} 个单词</p>
        </div>

        <!-- 学习结果列表 -->
        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr class="bg-gray-100">
                <th class="border border-gray-300 px-4 py-2 text-left">单词</th>
                <th class="border border-gray-300 px-4 py-2 text-left">陌生度</th>
                <th class="border border-gray-300 px-4 py-2 text-left">出现次数</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(result, index) in learningResults" :key="index" class="hover:bg-gray-50">
                <td class="border border-gray-300 px-4 py-2">{{ result.word }}</td>
                <td class="border border-gray-300 px-4 py-2">{{ result.unfamiliarity.toFixed(2) }}</td>
                <td class="border border-gray-300 px-4 py-2">{{ result.occurrences }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 重新学习按钮 -->
        <div class="mt-8 flex justify-center">
          <button
            @click="restartLearning"
            class="bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
          >
            重新学习
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 全局样式 */
#app {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
</style>
