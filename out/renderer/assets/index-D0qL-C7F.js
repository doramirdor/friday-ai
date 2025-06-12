import { m as markdownLineEndingOrSpace, u as unicodeWhitespace, a as unicodePunctuation } from "./index-Bq0gbX2R.js";
function classifyCharacter(code) {
  if (code === null || markdownLineEndingOrSpace(code) || unicodeWhitespace(code)) {
    return 1;
  }
  if (unicodePunctuation(code)) {
    return 2;
  }
}
export {
  classifyCharacter as c
};
