let idCounter = 1;
export function uuidv4(): string {
  return `uuid-${idCounter++}`;
}
