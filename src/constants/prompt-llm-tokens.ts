/** Prompt LLM 人物关键词宏 */
export const PROMPT_LLM_TRIGGER_NAMES_TOKEN = '{{trigger_names}}';

/** Prompt LLM 人物固定正面 tag 宏 */
export const PROMPT_LLM_FIXED_POSITIVE_TAGS_TOKEN = '{{fixed_positive_tags}}';

/** 旧版固定正面 tag 宏（存量模板兼容：仅继续替换，不再新增引用） */
export const PROMPT_LLM_FIXED_TAGS_TOKEN = '{{fixed_tags}}';

/** Prompt LLM 人物固定负面 tag 宏 */
export const PROMPT_LLM_FIXED_NEGATIVE_TAGS_TOKEN = '{{fixed_negative_tags}}';

/** 人物默认固定正面 tag 模板块 */
export const DEFAULT_PROMPT_PERSON_FIXED_POSITIVE_TAGS_BLOCK = `<fixed_positive_tags>以下固定正面tag为角色特性，必须原样体现在最终正面提示词中：${PROMPT_LLM_FIXED_POSITIVE_TAGS_TOKEN}</fixed_positive_tags>。`;

/** 人物默认固定负面 tag 模板块 */
export const DEFAULT_PROMPT_PERSON_FIXED_NEGATIVE_TAGS_BLOCK = `<fixed_negative_tags>
以下为该人物必须规避的负面特征。必须原样体现在最终负面提示词中；当前全局规则不需要负面提示词时忽略本块。
${PROMPT_LLM_FIXED_NEGATIVE_TAGS_TOKEN}
</fixed_negative_tags>`;

/** Prompt LLM 焦点段落宏 */
export const PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN = '{{focus_paragraph}}';

/** Prompt LLM 本次特别要求宏 */
export const PROMPT_LLM_SPECIAL_REQUEST_TOKEN = '{{special_request}}';

/** Prompt LLM 历史消息宏 */
export const PROMPT_LLM_HISTORY_TOKEN = '{{history}}';

/** Prompt LLM 人物总体信息宏 */
export const PROMPT_LLM_PARTICIPANT_TOKEN = '{{participants}}';
