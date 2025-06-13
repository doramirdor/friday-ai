import { m as minifyWhitespace, e as embedded, p as phrasing } from "./index-DAUtpLsD.js";
import { v as visitParents, S as SKIP } from "./index-Db1BflSh.js";
import { w as whitespace } from "./index-G-ora8YN.js";
const whitespaceSensitiveTagNames = [
  "pre",
  "script",
  "style",
  "textarea"
];
const emptyOptions = {};
function format(tree, options) {
  const settings = options || emptyOptions;
  const state = {
    blanks: settings.blanks || [],
    head: false,
    indentInitial: settings.indentInitial !== false,
    indent: typeof settings.indent === "number" ? " ".repeat(settings.indent) : typeof settings.indent === "string" ? settings.indent : "  "
  };
  minifyWhitespace(tree, { newlines: true });
  visitParents(tree, visitor);
  function visitor(node, parents) {
    if (!("children" in node)) {
      return;
    }
    if (node.type === "element" && node.tagName === "head") {
      state.head = true;
    }
    if (state.head && node.type === "element" && node.tagName === "body") {
      state.head = false;
    }
    if (node.type === "element" && whitespaceSensitiveTagNames.includes(node.tagName)) {
      return SKIP;
    }
    if (node.children.length === 0 || !padding(state, node)) {
      return;
    }
    let level = parents.length;
    if (!state.indentInitial) {
      level--;
    }
    let eol = false;
    for (const child of node.children) {
      if (child.type === "comment" || child.type === "text") {
        if (child.value.includes("\n")) {
          eol = true;
        }
        child.value = child.value.replace(
          / *\n/g,
          "$&" + state.indent.repeat(level)
        );
      }
    }
    const result = [];
    let previous;
    for (const child of node.children) {
      if (padding(state, child) || eol && !previous) {
        addBreak(result, level, child);
        eol = true;
      }
      previous = child;
      result.push(child);
    }
    if (previous && (eol || padding(state, previous))) {
      if (whitespace(previous)) {
        result.pop();
        previous = result[result.length - 1];
      }
      addBreak(result, level - 1);
    }
    node.children = result;
  }
  function addBreak(list, level, next) {
    const tail = list[list.length - 1];
    const previous = tail && whitespace(tail) ? list[list.length - 2] : tail;
    const replace = (blank(state, previous) && blank(state, next) ? "\n\n" : "\n") + state.indent.repeat(Math.max(level, 0));
    if (tail && tail.type === "text") {
      tail.value = whitespace(tail) ? replace : tail.value + replace;
    } else {
      list.push({ type: "text", value: replace });
    }
  }
}
function blank(state, node) {
  return Boolean(
    node && node.type === "element" && state.blanks.length > 0 && state.blanks.includes(node.tagName)
  );
}
function padding(state, node) {
  return node.type === "root" || (node.type === "element" ? state.head || node.tagName === "script" || embedded(node) || !phrasing(node) : false);
}
function rehypeFormat(options) {
  return function(tree) {
    format(tree, options);
  };
}
export {
  rehypeFormat as default
};
