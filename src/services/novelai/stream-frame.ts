/**
 * NovelAI 流式帧解析模块
 * 合并移植自 msgpack 帧解析与 SSE 图像流解析，msgpack 与 SSE 协议统一后的结构
 */

/** NovelAI 流式帧（与官方流协议对齐，msgpack 与 SSE 统一后的结构） */
export interface NovelAIStreamFrame {
  event_type: 'intermediate' | 'final' | 'error' | string;
  samp_ix: number;
  gen_id: number;
  step_ix?: number;
  sigma?: number;
  image?: Uint8Array;
  message?: string;
  error?: string;
  seed?: number;
}

// ---------------------------------------------------------------------------
// msgpack 解码器内部实现
// ---------------------------------------------------------------------------

// msgpack 解码器内部类型
type MsgpackValue =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | MsgpackValue[]
  | { [key: string]: MsgpackValue }

interface DecodeState { offset: number }

const textDecoder = new TextDecoder()
const MAX_FRAME_SIZE = 32 * 1024 * 1024 // 32MB

function ensureAvail(b: Uint8Array, s: DecodeState, n: number) {
  if (s.offset + n > b.length) throw new Error('msgpack 数据不完整')
}

function readUint(b: Uint8Array, s: DecodeState, size: number): number {
  ensureAvail(b, s, size)
  const v = new DataView(b.buffer, b.byteOffset + s.offset, size)
  s.offset += size
  if (size === 1) return v.getUint8(0)
  if (size === 2) return v.getUint16(0, false)
  return v.getUint32(0, false)
}

function readInt(b: Uint8Array, s: DecodeState, size: number): number {
  ensureAvail(b, s, size)
  const v = new DataView(b.buffer, b.byteOffset + s.offset, size)
  s.offset += size
  if (size === 1) return v.getInt8(0)
  if (size === 2) return v.getInt16(0, false)
  return v.getInt32(0, false)
}

function readFloat(b: Uint8Array, s: DecodeState, size: number): number {
  ensureAvail(b, s, size)
  const v = new DataView(b.buffer, b.byteOffset + s.offset, size)
  s.offset += size
  return size === 4 ? v.getFloat32(0, false) : v.getFloat64(0, false)
}

function readUint64(b: Uint8Array, s: DecodeState): number {
  const hi = readUint(b, s, 4)
  const lo = readUint(b, s, 4)
  const val = hi * 2 ** 32 + lo
  if (!Number.isSafeInteger(val)) throw new Error('uint64 超出安全范围')
  return val
}

function readInt64(b: Uint8Array, s: DecodeState): number {
  const hi = readUint(b, s, 4)
  const lo = readUint(b, s, 4)
  if (!(hi & 0x80000000)) {
    const val = hi * 2 ** 32 + lo
    if (!Number.isSafeInteger(val)) throw new Error('int64 超出安全范围')
    return val
  }
  const mag = ((~hi) >>> 0) * 2 ** 32 + ((~lo) >>> 0) + 1
  const val = -mag
  if (!Number.isSafeInteger(val)) throw new Error('int64 超出安全范围')
  return val
}

function readStr(b: Uint8Array, s: DecodeState, len: number): string {
  ensureAvail(b, s, len)
  const view = b.subarray(s.offset, s.offset + len)
  s.offset += len
  return textDecoder.decode(view)
}

function readBin(b: Uint8Array, s: DecodeState, len: number): Uint8Array {
  ensureAvail(b, s, len)
  const view = new Uint8Array(b.buffer, b.byteOffset + s.offset, len)
  s.offset += len
  return view
}

function decodeVal(b: Uint8Array, s: DecodeState): MsgpackValue {
  ensureAvail(b, s, 1)
  const p = b[s.offset++]!

  if (p <= 0x7f) return p
  if (p >= 0x80 && p <= 0x8f) {
    const n = p & 0x0f
    const obj: { [k: string]: MsgpackValue } = {}
    for (let i = 0; i < n; i++) {
      const k = decodeVal(b, s)
      obj[typeof k === 'string' ? k : String(k)] = decodeVal(b, s)
    }
    return obj
  }
  if (p >= 0x90 && p <= 0x9f) {
    const n = p & 0x0f
    const arr: MsgpackValue[] = []
    for (let i = 0; i < n; i++) arr.push(decodeVal(b, s))
    return arr
  }
  if (p >= 0xa0 && p <= 0xbf) return readStr(b, s, p & 0x1f)
  if (p >= 0xe0) return p - 0x100

  switch (p) {
    case 0xc0: return null
    case 0xc2: return false
    case 0xc3: return true
    case 0xc4: return readBin(b, s, readUint(b, s, 1))
    case 0xc5: return readBin(b, s, readUint(b, s, 2))
    case 0xc6: return readBin(b, s, readUint(b, s, 4))
    case 0xca: return readFloat(b, s, 4)
    case 0xcb: return readFloat(b, s, 8)
    case 0xcc: return readUint(b, s, 1)
    case 0xcd: return readUint(b, s, 2)
    case 0xce: return readUint(b, s, 4)
    case 0xcf: return readUint64(b, s)
    case 0xd0: return readInt(b, s, 1)
    case 0xd1: return readInt(b, s, 2)
    case 0xd2: return readInt(b, s, 4)
    case 0xd3: return readInt64(b, s)
    case 0xd9: return readStr(b, s, readUint(b, s, 1))
    case 0xda: return readStr(b, s, readUint(b, s, 2))
    case 0xdb: return readStr(b, s, readUint(b, s, 4))
    case 0xdc: {
      const n = readUint(b, s, 2)
      const arr: MsgpackValue[] = []
      for (let i = 0; i < n; i++) arr.push(decodeVal(b, s))
      return arr
    }
    case 0xdd: {
      const n = readUint(b, s, 4)
      const arr: MsgpackValue[] = []
      for (let i = 0; i < n; i++) arr.push(decodeVal(b, s))
      return arr
    }
    case 0xde: {
      const n = readUint(b, s, 2)
      const obj: { [k: string]: MsgpackValue } = {}
      for (let i = 0; i < n; i++) {
        const k = decodeVal(b, s)
        obj[typeof k === 'string' ? k : String(k)] = decodeVal(b, s)
      }
      return obj
    }
    case 0xdf: {
      const n = readUint(b, s, 4)
      const obj: { [k: string]: MsgpackValue } = {}
      for (let i = 0; i < n; i++) {
        const k = decodeVal(b, s)
        obj[typeof k === 'string' ? k : String(k)] = decodeVal(b, s)
      }
      return obj
    }
    default: throw new Error(`不支持的 msgpack 前缀: 0x${p.toString(16)}`)
  }
}

/**
 * 最小 msgpack 解码器（覆盖 NovelAI 流式帧所需类型）
 * @param bytes - 待解码的 msgpack 字节数组
 * @returns 解码后的 JS 值（null/boolean/number/string/Uint8Array/数组/对象）
 * @throws 当数据不完整、存在未消费字节或包含不支持的前缀时抛出错误
 */
export function decodeMsgpack(bytes: Uint8Array): MsgpackValue {
  const s: DecodeState = { offset: 0 }
  const val = decodeVal(bytes, s)
  if (s.offset !== bytes.length) throw new Error('msgpack 数据存在未消费字节')
  return val
}

/**
 * 解析 NovelAI msgpack 流帧
 * 帧格式：[4字节大端长度] + [msgpack对象]
 * @param stream - 响应二进制流
 * @returns 逐帧产出的 NovelAIStreamFrame 异步生成器
 * @throws 当帧长度非法、载荷不是对象或流在非帧边界结束时抛出错误
 */
export async function* parseMsgpackFrames(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<NovelAIStreamFrame, void, unknown> {
  const reader = stream.getReader()
  let buf = new Uint8Array(0)

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.length) continue

      // 追加新数据
      const next = new Uint8Array(buf.length + value.length)
      next.set(buf); next.set(value, buf.length)
      buf = next

      // 按帧分割
      while (buf.length >= 4) {
        const frameLen = new DataView(buf.buffer, buf.byteOffset).getUint32(0, false)
        if (frameLen <= 0 || frameLen > MAX_FRAME_SIZE) throw new Error(`非法 msgpack 帧长度: ${frameLen}`)
        if (buf.length < 4 + frameLen) break

        const payload = buf.slice(4, 4 + frameLen)
        buf = buf.slice(4 + frameLen)

        const decoded = decodeMsgpack(payload)
        if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('msgpack 帧必须是对象')
        yield decoded as unknown as NovelAIStreamFrame
      }
    }

    if (buf.length !== 0) throw new Error('msgpack 流在非帧边界结束')
  } finally {
    reader.releaseLock()
  }
}

// ---------------------------------------------------------------------------
// SSE 图像流解析实现
// ---------------------------------------------------------------------------

/** SSE 缓冲区上限（32MB） */
const MAX_SSE_BUFFER = 32 * 1024 * 1024

/**
 * 结构化 SSE 原始事件
 */
interface SseEvent {
  event: string
  data: string
}

/**
 * 单张图像条目元数据
 */
interface ImageEntry {
  value: string
  index: number
  fields: Record<string, unknown>
}

/**
 * 安全转换有限数字，失败时返回 fallback
 * @param value - 输入值
 * @param fallback - 默认值
 */
function finiteNumber(value: unknown, fallback: number): number {
  if (value == null || value === '') return fallback
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

/** 值存在时规范化为有限数字，否则返回 undefined */
function optionalNumber(value: unknown): number | undefined {
  return value == null || value === '' ? undefined : finiteNumber(value, 0)
}

/**
 * 快速安全 base64 解码为 Uint8Array
 * @param raw - 原始 base64 字符串或 DataURL
 * @returns 二进制 Uint8Array 或 undefined
 */
export function decodeBase64Image(raw?: string | null): Uint8Array | undefined {
  if (!raw || typeof raw !== 'string') return undefined

  let str = raw
  if (str.startsWith('data:')) {
    const commaIndex = str.indexOf(',')
    if (commaIndex === -1) return undefined
    str = str.slice(commaIndex + 1)
  }

  // 校验有效 base64 字符
  if (/^\s*$/.test(str)) return undefined

  // 标准化 URL-safe base64 并移除内部空白字符
  if (/[\s\-_]/.test(str)) {
    str = str.replace(/[\s\r\n]+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  }

  const remainder = str.length % 4
  if (remainder === 1) {
    // 长度余 1 为无效 base64
    return undefined
  }
  if (remainder > 1) {
    str += '='.repeat(4 - remainder)
  }

  try {
    const binary = atob(str)
    const len = binary.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return undefined
  }
}

/**
 * 宽松解析 JSON 负载
 * @param data - SSE data 字符串
 */
function parsePayload(data: string): Record<string, unknown> {
  if (!data || /^\s*$/.test(data)) return {}
  try {
    const parsed = JSON.parse(data)
    if (Array.isArray(parsed)) {
      return { images: parsed }
    }
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>
    }
  } catch {
    // 忽略非 JSON 解析异常，直接回退为原始字符串负载
  }
  return { image: data }
}

/**
 * 归一化事件类型
 * @param eventName - 原始事件名
 * @param payload - 事件负载
 */
function frameType(eventName: string, payload: Record<string, unknown>): NovelAIStreamFrame['event_type'] | 'ready' {
  const name = (eventName || '').toLowerCase()

  if (name === 'ready') return 'ready'
  if (name === 'error') return 'error'

  if (name === 'done' || name === 'final' || name === 'complete' || name === 'finished') {
    return 'final'
  }

  if (name === '') {
    if (Boolean(payload.error) || payload.event_type === 'error' || payload.event === 'error') {
      return 'error'
    }
    if (payload.final_image != null || payload.event_type === 'final' || payload.event === 'final') {
      return 'final'
    }
    return 'intermediate'
  }

  // 其他任意事件名归一化为 intermediate
  return 'intermediate'
}

/**
 * 从负载中提取多图条目
 * @param payload - 事件负载
 */
function imageEntries(payload: Record<string, unknown>): ImageEntry[] {
  const result: ImageEntry[] = []

  if (Array.isArray(payload.images)) {
    for (let i = 0; i < payload.images.length; i++) {
      const item = payload.images[i]
      if (typeof item === 'string') {
        result.push({ value: item, index: i, fields: {} })
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        const val = typeof obj.data === 'string' ? obj.data : typeof obj.image === 'string' ? obj.image : ''
        const index = finiteNumber(obj.samp_ix, i)
        if (val) {
          result.push({ value: val, index, fields: obj })
        }
      }
    }
    if (result.length > 0) return result
  }

  const singleVal = payload.image ?? payload.final_image
  if (typeof singleVal === 'string' && singleVal) {
    const index = finiteNumber(payload.samp_ix, 0)
    result.push({ value: singleVal, index, fields: payload })
  }

  return result
}

/**
 * 构造统一错误帧
 * @param payload - 负载对象
 * @param defaultMessage - 默认错误信息
 */
function errorFrame(payload: Record<string, unknown>, defaultMessage: string): NovelAIStreamFrame {
  const error = String(payload.error || payload.message || payload.detail || defaultMessage || '流式生成失败')
  return {
    event_type: 'error',
    samp_ix: finiteNumber(payload.samp_ix, 0),
    gen_id: finiteNumber(payload.gen_id, 0),
    error,
    message: String(payload.message || error),
  }
}

/**
 * 将一个 SSE 事件转换为统一图像帧。
 * @param event - 原始 SSE 事件
 */
function* convertEvent(event: SseEvent): Generator<NovelAIStreamFrame, void, unknown> {
  const payload = parsePayload(event.data)
  const type = frameType(event.event, payload)
  if (type === 'ready') return
  if (type === 'error') {
    yield errorFrame(payload, event.data)
    return
  }

  const entries = imageEntries(payload)
  const isMulti = entries.length > 1
  const payloadSeed = finiteNumber(payload.seed, Number.NaN)
  const hasPayloadSeed = Number.isFinite(payloadSeed)

  let yieldedCount = 0

  for (const [i, entry] of entries.entries()) {
    const image = decodeBase64Image(entry.value)
    if (!image) continue

    const samp_ix = entry.index
    const gen_id = finiteNumber(entry.fields.gen_id ?? payload.gen_id, 0)

    const step_ix = optionalNumber(entry.fields.step_ix ?? payload.step_ix)
    const sigma = optionalNumber(entry.fields.sigma ?? payload.sigma)

    let seed: number | undefined
    if (hasPayloadSeed) {
      seed = isMulti ? payloadSeed + i : payloadSeed
    } else {
      seed = optionalNumber(entry.fields.seed)
    }

    const frame: NovelAIStreamFrame = {
      event_type: type,
      samp_ix,
      gen_id,
      image,
    }
    if (step_ix !== undefined) frame.step_ix = step_ix
    if (sigma !== undefined) frame.sigma = sigma
    if (seed !== undefined) frame.seed = seed

    yieldedCount++
    yield frame
  }

  // 吞错兜底：final 事件若未成功解码出任何图像，产出错误帧
  if (type === 'final' && yieldedCount === 0) {
    yield errorFrame(payload, '最终图像解码失败')
  }
}

/**
 * 按 WHATWG SSE 规范解析行终止符并逐行派发事件。
 * @param stream - 二进制输入流
 */
async function* readEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let searchIndex = 0

  let currentEvent = ''
  const currentData: string[] = []

  const dispatchEvent = (): SseEvent | null => {
    if (currentData.length > 0 || currentEvent !== '') {
      const ev: SseEvent = {
        event: currentEvent,
        data: currentData.join('\n'),
      }
      currentEvent = ''
      currentData.length = 0
      return ev
    }
    return null
  }

  const processLine = (line: string): SseEvent | null => {
    // 遇到空行即分发事件
    if (line.length === 0) {
      return dispatchEvent()
    }
    // 忽略注释行
    if (line.charCodeAt(0) === 0x3a /* ':' */) {
      return null
    }
    if (line.startsWith('event:')) {
      const val = line.slice(6)
      currentEvent = val.startsWith(' ') ? val.slice(1) : val
    } else if (line.startsWith('data:')) {
      const val = line.slice(5)
      const data = val.startsWith(' ') ? val.slice(1) : val
      // 单个事件的多条 data 行累计也需受限，防止绕过行缓冲上限
      const accumulated = currentData.reduce((sum, item) => sum + item.length, 0)
      if (accumulated + data.length > MAX_SSE_BUFFER) {
        throw new Error('SSE 事件数据超过 32MB 限制')
      }
      currentData.push(data)
    } else if (line === 'event') {
      currentEvent = ''
    } else if (line === 'data') {
      currentData.push('')
    }
    return null
  }

  function* drainLines(isEof = false): Generator<SseEvent> {
    // 增量查找行终止符：CRLF(\r\n)、LF(\n)、CR(\r)
    while (searchIndex < buffer.length) {
      const ch = buffer.charCodeAt(searchIndex)
      if (ch === 0x0a /* \n */) {
        const line = buffer.slice(0, searchIndex)
        buffer = buffer.slice(searchIndex + 1)
        searchIndex = 0
        const ev = processLine(line)
        if (ev) yield ev
      } else if (ch === 0x0d /* \r */) {
        if (!isEof && searchIndex === buffer.length - 1) {
          // \r 处于缓冲区末尾，等待下一分块判断是否为 \r\n
          break
        }
        const isCrlf = searchIndex + 1 < buffer.length && buffer.charCodeAt(searchIndex + 1) === 0x0a
        const line = buffer.slice(0, searchIndex)
        buffer = buffer.slice(searchIndex + (isCrlf ? 2 : 1))
        searchIndex = 0
        const ev = processLine(line)
        if (ev) yield ev
      } else {
        searchIndex++
      }
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.length) continue

      buffer += decoder.decode(value, { stream: true })
      if (buffer.length > MAX_SSE_BUFFER) {
        throw new Error('SSE 缓冲区超过 32MB 限制')
      }

      yield* drainLines()
    }

    // 处理流结束时的解码器剩余数据
    const remaining = decoder.decode()
    if (remaining.length > 0) {
      buffer += remaining
      if (buffer.length > MAX_SSE_BUFFER) {
        throw new Error('SSE 缓冲区超过 32MB 限制')
      }
    }

    yield* drainLines(true)

    // 处理最后未空行结束的行缓冲
    if (buffer.length > 0) {
      const ev = processLine(buffer)
      if (ev) yield ev
      buffer = ''
    }

    // 分发流末尾可能未分发的事件
    const lastEv = dispatchEvent()
    if (lastEv) yield lastEv
  } finally {
    reader.releaseLock()
  }
}

/**
 * 解析 SSE 图像流为统一 NovelAIStreamFrame 生成器。
 * @param stream - ReadableStream 二进制流
 * @returns 逐帧产出的 NovelAIStreamFrame 异步生成器；流结束仍无 final/error 时兜底产出 error 帧
 */
export async function* parseSseFrames(stream: ReadableStream<Uint8Array>): AsyncGenerator<NovelAIStreamFrame, void, unknown> {
  let hasFinal = false
  let hasError = false

  for await (const event of readEvents(stream)) {
    for (const frame of convertEvent(event)) {
      if (frame.event_type === 'final') hasFinal = true
      if (frame.event_type === 'error') hasError = true
      yield frame
    }
  }

  // 兜底校验：流正常结束但既未产出 final 帧也未产出 error 帧
  if (!hasFinal && !hasError) {
    yield {
      event_type: 'error',
      samp_ix: 0,
      gen_id: 0,
      error: '流式生成未返回最终图像',
      message: '流式生成未返回最终图像',
    }
  }
}

/**
 * 判断响应 Content-Type 是否为 SSE 事件流
 * @param contentType - 响应 Content-Type 标头
 * @returns 含 'event-stream' 时返回 true，否则 false
 */
export function isSseContentType(contentType: string): boolean {
  return contentType.includes('event-stream')
}

/**
 * 根据 Content-Type 自动选择对应的流式帧解析器
 * @param stream - 响应二进制流
 * @param contentType - 响应 Content-Type 标头
 * @returns 统一 NovelAIStreamFrame 异步生成器（SSE 或 msgpack 分流）
 */
export function parseImageFrames(
  stream: ReadableStream<Uint8Array>,
  contentType: string,
): AsyncGenerator<NovelAIStreamFrame, void, unknown> {
  return isSseContentType(contentType)
    ? parseSseFrames(stream)
    : parseMsgpackFrames(stream)
}
