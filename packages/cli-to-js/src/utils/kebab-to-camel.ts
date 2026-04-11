export const kebabToCamel = (input: string): string =>
  input.replace(/-([a-z])/g, (_match, character: string) => character.toUpperCase());
