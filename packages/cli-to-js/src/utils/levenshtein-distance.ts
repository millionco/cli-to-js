export const levenshteinDistance = (source: string, target: string): number => {
  const sourceLength = source.length;
  const targetLength = target.length;

  if (sourceLength === 0) return targetLength;
  if (targetLength === 0) return sourceLength;

  const matrix: number[][] = Array.from({ length: sourceLength + 1 }, () =>
    Array.from<number>({ length: targetLength + 1 }).fill(0),
  );

  for (let rowIndex = 0; rowIndex <= sourceLength; rowIndex++) matrix[rowIndex][0] = rowIndex;
  for (let columnIndex = 0; columnIndex <= targetLength; columnIndex++)
    matrix[0][columnIndex] = columnIndex;

  for (let rowIndex = 1; rowIndex <= sourceLength; rowIndex++) {
    for (let columnIndex = 1; columnIndex <= targetLength; columnIndex++) {
      const substitutionCost = source[rowIndex - 1] === target[columnIndex - 1] ? 0 : 1;
      matrix[rowIndex][columnIndex] = Math.min(
        matrix[rowIndex - 1][columnIndex] + 1,
        matrix[rowIndex][columnIndex - 1] + 1,
        matrix[rowIndex - 1][columnIndex - 1] + substitutionCost,
      );
    }
  }

  return matrix[sourceLength][targetLength];
};
