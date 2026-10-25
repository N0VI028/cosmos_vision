/**
 * PNG 文本 Chunk 数据项
 */
export interface PngTextChunk {
  /** Chunk 关键字 (如 Description, Comment, parameters, prompt 等) */
  keyword: string;
  /** 解码及解压后的文本内容 */
  text: string;
}
