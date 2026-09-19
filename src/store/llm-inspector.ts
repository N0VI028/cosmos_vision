import { eventSource } from '@sillytavern/script';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type { LlmInspectorRequestSnapshot } from '@/services/prompt-llm/llm-inspector';
import { isThinkingStreaming, splitThinkingContent } from '@/services/prompt-llm/thinking-stream-parser';
import type { PromptLlmParamRow } from '@/services/tavern-helper/prompt-llm-test';

/** 会话保留上限（内存态，刷新页面即清空） */
const MAX_SESSIONS = 50;

/** TavernHelper 流式事件名（js_generation_started 对账靠快照侧，无需订阅） */
const STREAM_TOKEN_EVENT = 'js_stream_token_received_fully';
const GENERATION_ENDED_EVENT = 'js_generation_ended';

/** 监视会话状态 */
export type LlmInspectorSessionStatus = 'running' | 'completed' | 'failed';

/** 单次账号请求列表（故障转移时逐账号记录） */
export interface LlmInspectorAttempt {
  accountName: string;
  /** 该次尝试开始时刻（本次请求构建时刻；内部计时用，UI 不展示） */
  startedAt: number;
  /** 本次尝试的失败原因（成功尝试为空） */
  error?: string;
  /** 本次尝试耗时毫秒（进行中的尝试不封口、不写该字段） */
  durationMs?: number;
  /** 本次尝试账号参数展示行 */
  paramRows: PromptLlmParamRow[];
}

/** 监视会话完整记录 */
export interface LlmInspectorSession extends LlmInspectorRequestSnapshot {
  status: LlmInspectorSessionStatus;
  /** 思考过程（含正文内联思考标签分离结果） */
  thinkingText: string;
  /** 正文（流式累积或最终全文） */
  contentText: string;
  /** 思考块是否仍在流式输出（存在未闭合思考标签） */
  thinkingStreaming: boolean;
  /** 逐账号请求列表（按尝试顺序） */
  attempts: LlmInspectorAttempt[];
  finishedAt?: number;
  error?: string;
}

/**
 * 封口尝试列表中最后一次未封口的尝试：补写耗时（可选追加失败原因），已封口则跳过
 * 监视 store 与设置页测试 tab 共用
 * @param attempts 尝试列表
 * @param endedAt 尝试结束时间戳
 * @param error 本次尝试的失败原因
 */
export function sealLlmInspectorAttempt(attempts: LlmInspectorAttempt[], endedAt: number, error?: string): void {
  const attempt = attempts.at(-1);
  if (!attempt || attempt.durationMs !== undefined) return;
  attempt.durationMs = Math.max(0, endedAt - attempt.startedAt);
  if (error) attempt.error = error;
}

/**
 * LLM 请求监视 Store
 * 发送侧由 useInlineImageGeneration 通过钩子写入（仅内联生图）；
 * 响应侧订阅 TavernHelper 在 ST eventSource 上广播的流式事件，
 * 按 generation_id 过滤自家请求。内存态，不落盘。
 */
export const useLlmInspectorStore = defineStore('cosmos_vision_llm_inspector', () => {
  /** 会话记录（新 → 旧） */
  const sessions = ref<LlmInspectorSession[]>([]);
  /** 事件订阅是否已建立 */
  let subscribed = false;

  /** 是否存在进行中的会话 */
  const hasRunningSession = computed(() => sessions.value.some(session => session.status === 'running'));

  /**
   * 记录请求快照（每次账号尝试调用；多账号故障转移时更新请求侧信息）
   * @param snapshot 请求快照
   */
  function recordRequest(snapshot: LlmInspectorRequestSnapshot): void {
    const existing = findSessionIndex(snapshot.id);
    if (existing === -1) {
      sessions.value = [
        {
          ...snapshot,
          status: 'running' as const,
          thinkingText: '',
          contentText: '',
          thinkingStreaming: false,
          attempts: [{ accountName: snapshot.accountName, startedAt: snapshot.startedAt, paramRows: snapshot.paramRows }],
        },
        ...sessions.value,
      ].slice(0, MAX_SESSIONS);
      return;
    }
    // 故障转移重试：封口上一次尝试后追加新账号，更新请求侧信息并保留已流出的响应文本
    const session = sessions.value[existing]!;
    sealLlmInspectorAttempt(session.attempts, snapshot.startedAt);
    session.attempts.push({
      accountName: snapshot.accountName,
      startedAt: snapshot.startedAt,
      paramRows: snapshot.paramRows,
    });
    Object.assign(session, snapshot);
  }

  /**
   * 标记会话成功（请求返回后调用；流式内容此前已由事件逐步写入）
   * @param id generation_id
   * @param rawText LLM 原始响应全文
   * @param accountName 实际成功的账号名
   */
  function markSucceeded(id: string, rawText: string, accountName: string): void {
    const session = findSession(id);
    if (!session) return;
    completeSession(session, rawText, accountName);
  }

  /**
   * 标记会话失败（全部账号尝试失败或请求异常）
   * @param id generation_id
   * @param error 失败原因
   */
  function markFailed(id: string, error: unknown): void {
    const session = findSession(id);
    if (!session) return;
    session.status = 'failed';
    session.finishedAt = Date.now();
    session.error = error instanceof Error ? error.message : String(error);
    session.thinkingStreaming = false;
    sealLlmInspectorAttempt(session.attempts, session.finishedAt, session.error);
  }

  /**
   * 给最后一次未封口的尝试写入失败原因（单账号故障转移失败时调用）
   * @param id generation_id
   * @param error 失败原因
   */
  function appendAttemptError(id: string, error: unknown): void {
    const attempt = findSession(id)?.attempts.at(-1);
    if (!attempt || attempt.durationMs !== undefined) return;
    attempt.error = error instanceof Error ? error.message : String(error);
  }

  /**
   * 建立流式事件订阅（幂等；App 挂载时调用）
   */
  function start(): void {
    if (subscribed) return;
    subscribed = true;
    eventSource.on(STREAM_TOKEN_EVENT, handleStreamToken);
    eventSource.on(GENERATION_ENDED_EVENT, handleGenerationEnded);
  }

  /**
   * 解除订阅（App 卸载时调用）
   */
  function stop(): void {
    if (!subscribed) return;
    subscribed = false;
    eventSource.removeListener(STREAM_TOKEN_EVENT, handleStreamToken);
    eventSource.removeListener(GENERATION_ENDED_EVENT, handleGenerationEnded);
  }

  /**
   * 清空全部会话记录
   */
  function clearSessions(): void {
    sessions.value = [];
  }

  /**
   * 处理流式增量事件：按 generation_id 过滤自家请求并分离思考/正文
   * @param text 累积全文
   * @param generationId 请求标识
   */
  function handleStreamToken(text: string, generationId: string): void {
    const session = findSession(generationId);
    if (!session || session.status !== 'running') return;
    const { thinking, content } = splitThinkingContent(text);
    session.thinkingText = thinking;
    session.contentText = content;
    session.thinkingStreaming = isThinkingStreaming(text);
  }

  /**
   * 处理生成结束事件：写入最终全文并标记完成
   * @param message 最终消息
   * @param generationId 请求标识
   */
  function handleGenerationEnded(message: string, generationId: string): void {
    const session = findSession(generationId);
    if (!session || session.status !== 'running') return;
    completeSession(session, message);
  }

  /**
   * 幂等写入完成终态（ended 事件与成功钩子可能先后到达，取信息更全的一次）
   * @param session 目标会话
   * @param rawText 响应全文
   * @param accountName 实际成功的账号名（ended 事件侧无此信息则不覆盖）
   */
  function completeSession(session: LlmInspectorSession, rawText: string, accountName?: string): void {
    const { thinking, content } = splitThinkingContent(rawText);
    session.status = 'completed';
    session.finishedAt = Date.now();
    if (accountName) session.accountName = accountName;
    session.thinkingStreaming = false;
    // 空文本不覆盖，保留事件/钩子中信息更全的一次
    if (thinking) session.thinkingText = thinking;
    if (content) session.contentText = content;
    sealLlmInspectorAttempt(session.attempts, session.finishedAt);
  }

  /**
   * 查找会话下标
   * @param id generation_id
   */
  function findSessionIndex(id: string): number {
    return sessions.value.findIndex(session => session.id === id);
  }

  /**
   * 查找可变会话引用（ref 数组内对象为 reactive）
   * @param id generation_id
   */
  function findSession(id: string): LlmInspectorSession | undefined {
    return sessions.value.find(session => session.id === id);
  }

  return {
    sessions,
    hasRunningSession,
    recordRequest,
    markSucceeded,
    markFailed,
    appendAttemptError,
    start,
    stop,
    clearSessions,
  };
});
