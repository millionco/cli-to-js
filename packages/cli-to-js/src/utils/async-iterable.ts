export type AsyncTransform = (source: AsyncIterable<string>) => AsyncIterable<string>;

export const map = (transform: (line: string) => string): AsyncTransform =>
  async function* mapTransform(source) {
    for await (const line of source) {
      yield transform(line);
    }
  };

export const filter = (predicate: (line: string) => boolean): AsyncTransform =>
  async function* filterTransform(source) {
    for await (const line of source) {
      if (predicate(line)) yield line;
    }
  };

export const take = (count: number): AsyncTransform =>
  async function* takeTransform(source) {
    let taken = 0;
    for await (const line of source) {
      if (taken >= count) break;
      yield line;
      taken++;
    }
  };
