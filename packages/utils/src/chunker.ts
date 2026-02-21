export interface Chunk {
  content: string;
  index: number;
  startOffset: number;
}

export interface ChunkOptions {
  size?: number;
  overlap?: number;
}

export function chunkText(text: string, options?: ChunkOptions): Chunk[] {
  const size = options?.size ?? 1000;
  const overlap = options?.overlap ?? 150;

  if (!text || text.trim().length === 0) {
    return [];
  }

  if (text.length <= size) {
    return [{ content: text, index: 0, startOffset: 0 }];
  }

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);

    // Try to break at paragraph boundary
    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf("\n\n", end);
      if (paragraphBreak > start + size / 2) {
        end = paragraphBreak + 2;
      } else {
        // Try sentence boundary
        const sentenceBreak = findLastSentenceBreak(text, start + Math.floor(size / 2), end);
        if (sentenceBreak > start) {
          end = sentenceBreak;
        }
      }
    }

    chunks.push({
      content: text.slice(start, end).trim(),
      index,
      startOffset: start,
    });

    index++;
    start = end - overlap;
    if (start >= text.length) break;
    // Avoid infinite loops
    if (start <= chunks[chunks.length - 1].startOffset) {
      start = end;
    }
  }

  return chunks.filter((c) => c.content.length > 0);
}

function findLastSentenceBreak(text: string, from: number, to: number): number {
  const segment = text.slice(from, to);
  const match = segment.match(/.*[.!?]\s/s);
  if (match && match.index !== undefined) {
    return from + match.index + match[0].length;
  }
  return -1;
}
