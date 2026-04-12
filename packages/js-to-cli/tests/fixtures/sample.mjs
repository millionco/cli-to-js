export const greet = (name, { loud = false, times = 1 } = {}) => {
  const phrase = `Hello, ${name}!`;
  const shouted = loud ? phrase.toUpperCase() : phrase;
  return Array.from({ length: times }, () => shouted).join("\n");
};

export const add = (a = 0, b = 0) => Number(a) + Number(b);

export const tags = ({ tag = [] } = {}) => tag.join(",");
