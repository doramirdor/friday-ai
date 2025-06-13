import { c as convert } from "./index-Db1BflSh.js";
import { w as whitespace } from "./index-G-ora8YN.js";
const isElement = (
  // Note: overloads in JSDoc can’t yet use different `@template`s.
  /**
   * @type {(
   *   (<Condition extends TestFunction>(element: unknown, test: Condition, index?: number | null | undefined, parent?: Parents | null | undefined, context?: unknown) => element is Element & Predicate<Condition, Element>) &
   *   (<Condition extends string>(element: unknown, test: Condition, index?: number | null | undefined, parent?: Parents | null | undefined, context?: unknown) => element is Element & {tagName: Condition}) &
   *   ((element?: null | undefined) => false) &
   *   ((element: unknown, test?: null | undefined, index?: number | null | undefined, parent?: Parents | null | undefined, context?: unknown) => element is Element) &
   *   ((element: unknown, test?: Test, index?: number | null | undefined, parent?: Parents | null | undefined, context?: unknown) => boolean)
   * )}
   */
  /**
   * @param {unknown} [element]
   * @param {Test | undefined} [test]
   * @param {number | null | undefined} [index]
   * @param {Parents | null | undefined} [parent]
   * @param {unknown} [context]
   * @returns {boolean}
   */
  // eslint-disable-next-line max-params
  function(element2, test, index, parent, context) {
    const check = convertElement(test);
    return looksLikeAnElement(element2) ? check.call(context, element2, index, parent) : false;
  }
);
const convertElement = (
  // Note: overloads in JSDoc can’t yet use different `@template`s.
  /**
   * @type {(
   *   (<Condition extends TestFunction>(test: Condition) => (element: unknown, index?: number | null | undefined, parent?: Parents | null | undefined, context?: unknown) => element is Element & Predicate<Condition, Element>) &
   *   (<Condition extends string>(test: Condition) => (element: unknown, index?: number | null | undefined, parent?: Parents | null | undefined, context?: unknown) => element is Element & {tagName: Condition}) &
   *   ((test?: null | undefined) => (element?: unknown, index?: number | null | undefined, parent?: Parents | null | undefined, context?: unknown) => element is Element) &
   *   ((test?: Test) => Check)
   * )}
   */
  /**
   * @param {Test | null | undefined} [test]
   * @returns {Check}
   */
  function(test) {
    if (test === null || test === void 0) {
      return element;
    }
    if (typeof test === "string") {
      return tagNameFactory(test);
    }
    if (typeof test === "object") {
      return anyFactory(test);
    }
    if (typeof test === "function") {
      return castFactory(test);
    }
    throw new Error("Expected function, string, or array as `test`");
  }
);
function anyFactory(tests) {
  const checks = [];
  let index = -1;
  while (++index < tests.length) {
    checks[index] = convertElement(tests[index]);
  }
  return castFactory(any);
  function any(...parameters) {
    let index2 = -1;
    while (++index2 < checks.length) {
      if (checks[index2].apply(this, parameters)) return true;
    }
    return false;
  }
}
function tagNameFactory(check) {
  return castFactory(tagName);
  function tagName(element2) {
    return element2.tagName === check;
  }
}
function castFactory(testFunction) {
  return check;
  function check(value, index, parent) {
    return Boolean(
      looksLikeAnElement(value) && testFunction.call(
        this,
        value,
        typeof index === "number" ? index : void 0,
        parent || void 0
      )
    );
  }
}
function element(element2) {
  return Boolean(
    element2 && typeof element2 === "object" && "type" in element2 && element2.type === "element" && "tagName" in element2 && typeof element2.tagName === "string"
  );
}
function looksLikeAnElement(value) {
  return value !== null && typeof value === "object" && "type" in value && "tagName" in value;
}
const embedded = convertElement(
  /**
   * @param element
   * @returns {element is {tagName: 'audio' | 'canvas' | 'embed' | 'iframe' | 'img' | 'math' | 'object' | 'picture' | 'svg' | 'video'}}
   */
  function(element2) {
    return element2.tagName === "audio" || element2.tagName === "canvas" || element2.tagName === "embed" || element2.tagName === "iframe" || element2.tagName === "img" || element2.tagName === "math" || element2.tagName === "object" || element2.tagName === "picture" || element2.tagName === "svg" || element2.tagName === "video";
  }
);
const blocks = [
  "address",
  // Flow content.
  "article",
  // Sections and headings.
  "aside",
  // Sections and headings.
  "blockquote",
  // Flow content.
  "body",
  // Page.
  "br",
  // Contribute whitespace intrinsically.
  "caption",
  // Similar to block.
  "center",
  // Flow content, legacy.
  "col",
  // Similar to block.
  "colgroup",
  // Similar to block.
  "dd",
  // Lists.
  "dialog",
  // Flow content.
  "dir",
  // Lists, legacy.
  "div",
  // Flow content.
  "dl",
  // Lists.
  "dt",
  // Lists.
  "figcaption",
  // Flow content.
  "figure",
  // Flow content.
  "footer",
  // Flow content.
  "form",
  // Flow content.
  "h1",
  // Sections and headings.
  "h2",
  // Sections and headings.
  "h3",
  // Sections and headings.
  "h4",
  // Sections and headings.
  "h5",
  // Sections and headings.
  "h6",
  // Sections and headings.
  "head",
  // Page.
  "header",
  // Flow content.
  "hgroup",
  // Sections and headings.
  "hr",
  // Flow content.
  "html",
  // Page.
  "legend",
  // Flow content.
  "li",
  // Block-like.
  "li",
  // Similar to block.
  "listing",
  // Flow content, legacy
  "main",
  // Flow content.
  "menu",
  // Lists.
  "nav",
  // Sections and headings.
  "ol",
  // Lists.
  "optgroup",
  // Similar to block.
  "option",
  // Similar to block.
  "p",
  // Flow content.
  "plaintext",
  // Flow content, legacy
  "pre",
  // Flow content.
  "section",
  // Sections and headings.
  "summary",
  // Similar to block.
  "table",
  // Similar to block.
  "tbody",
  // Similar to block.
  "td",
  // Block-like.
  "td",
  // Similar to block.
  "tfoot",
  // Similar to block.
  "th",
  // Block-like.
  "th",
  // Similar to block.
  "thead",
  // Similar to block.
  "tr",
  // Similar to block.
  "ul",
  // Lists.
  "wbr",
  // Contribute whitespace intrinsically.
  "xmp"
  // Flow content, legacy
];
const content$1 = [
  // Form.
  "button",
  "input",
  "select",
  "textarea"
];
const skippable$1 = [
  "area",
  "base",
  "basefont",
  "dialog",
  "datalist",
  "head",
  "link",
  "meta",
  "noembed",
  "noframes",
  "param",
  "rp",
  "script",
  "source",
  "style",
  "template",
  "track",
  "title"
];
const emptyOptions = {};
const ignorableNode = convert(["comment", "doctype"]);
function minifyWhitespace(tree, options) {
  const settings = options || emptyOptions;
  minify(tree, {
    collapse: collapseFactory(
      settings.newlines ? replaceNewlines : replaceWhitespace
    ),
    whitespace: "normal"
  });
}
function minify(node, state) {
  if ("children" in node) {
    const settings = { ...state };
    if (node.type === "root" || blocklike(node)) {
      settings.before = true;
      settings.after = true;
    }
    settings.whitespace = inferWhiteSpace(node, state);
    return all(node, settings);
  }
  if (node.type === "text") {
    if (state.whitespace === "normal") {
      return minifyText(node, state);
    }
    if (state.whitespace === "nowrap") {
      node.value = state.collapse(node.value);
    }
  }
  return { ignore: ignorableNode(node), stripAtStart: false, remove: false };
}
function minifyText(node, state) {
  const value = state.collapse(node.value);
  const result = { ignore: false, stripAtStart: false, remove: false };
  let start = 0;
  let end = value.length;
  if (state.before && removable(value.charAt(0))) {
    start++;
  }
  if (start !== end && removable(value.charAt(end - 1))) {
    if (state.after) {
      end--;
    } else {
      result.stripAtStart = true;
    }
  }
  if (start === end) {
    result.remove = true;
  } else {
    node.value = value.slice(start, end);
  }
  return result;
}
function all(parent, state) {
  let before = state.before;
  const after = state.after;
  const children = parent.children;
  let length = children.length;
  let index = -1;
  while (++index < length) {
    const result = minify(children[index], {
      ...state,
      after: collapsableAfter(children, index, after),
      before
    });
    if (result.remove) {
      children.splice(index, 1);
      index--;
      length--;
    } else if (!result.ignore) {
      before = result.stripAtStart;
    }
    if (content(children[index])) {
      before = false;
    }
  }
  return { ignore: false, stripAtStart: Boolean(before || after), remove: false };
}
function collapsableAfter(nodes, index, after) {
  while (++index < nodes.length) {
    const node = nodes[index];
    let result = inferBoundary(node);
    if (result === void 0 && "children" in node && !skippable(node)) {
      result = collapsableAfter(node.children, -1);
    }
    if (typeof result === "boolean") {
      return result;
    }
  }
  return after;
}
function inferBoundary(node) {
  if (node.type === "element") {
    if (content(node)) {
      return false;
    }
    if (blocklike(node)) {
      return true;
    }
  } else if (node.type === "text") {
    if (!whitespace(node)) {
      return false;
    }
  } else if (!ignorableNode(node)) {
    return false;
  }
}
function content(node) {
  return embedded(node) || isElement(node, content$1);
}
function blocklike(node) {
  return isElement(node, blocks);
}
function skippable(node) {
  return Boolean(node.type === "element" && node.properties.hidden) || ignorableNode(node) || isElement(node, skippable$1);
}
function removable(character) {
  return character === " " || character === "\n";
}
function replaceNewlines(value) {
  const match = /\r?\n|\r/.exec(value);
  return match ? match[0] : " ";
}
function replaceWhitespace() {
  return " ";
}
function collapseFactory(replace) {
  return collapse;
  function collapse(value) {
    return String(value).replace(/[\t\n\v\f\r ]+/g, replace);
  }
}
function inferWhiteSpace(node, state) {
  if ("tagName" in node && node.properties) {
    switch (node.tagName) {
      // Whitespace in script/style, while not displayed by CSS as significant,
      // could have some meaning in JS/CSS, so we can’t touch them.
      case "listing":
      case "plaintext":
      case "script":
      case "style":
      case "xmp": {
        return "pre";
      }
      case "nobr": {
        return "nowrap";
      }
      case "pre": {
        return node.properties.wrap ? "pre-wrap" : "pre";
      }
      case "td":
      case "th": {
        return node.properties.noWrap ? "nowrap" : state.whitespace;
      }
      case "textarea": {
        return "pre-wrap";
      }
    }
  }
  return state.whitespace;
}
const own = {}.hasOwnProperty;
function hasProperty(node, name) {
  const value = node.type === "element" && own.call(node.properties, name) && node.properties[name];
  return value !== null && value !== void 0 && value !== false;
}
const list = /* @__PURE__ */ new Set(["pingback", "prefetch", "stylesheet"]);
function isBodyOkLink(node) {
  if (node.type !== "element" || node.tagName !== "link") {
    return false;
  }
  if (node.properties.itemProp) {
    return true;
  }
  const value = node.properties.rel;
  let index = -1;
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  while (++index < value.length) {
    if (!list.has(String(value[index]))) {
      return false;
    }
  }
  return true;
}
const basic = convertElement([
  "a",
  "abbr",
  // `area` is in fact only phrasing if it is inside a `map` element.
  // However, since `area`s are required to be inside a `map` element, and it’s
  // a rather involved check, it’s ignored here for now.
  "area",
  "b",
  "bdi",
  "bdo",
  "br",
  "button",
  "cite",
  "code",
  "data",
  "datalist",
  "del",
  "dfn",
  "em",
  "i",
  "input",
  "ins",
  "kbd",
  "keygen",
  "label",
  "map",
  "mark",
  "meter",
  "noscript",
  "output",
  "progress",
  "q",
  "ruby",
  "s",
  "samp",
  "script",
  "select",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "template",
  "textarea",
  "time",
  "u",
  "var",
  "wbr"
]);
const meta = convertElement("meta");
function phrasing(value) {
  return Boolean(
    value.type === "text" || basic(value) || embedded(value) || isBodyOkLink(value) || meta(value) && hasProperty(value, "itemProp")
  );
}
export {
  convertElement as c,
  embedded as e,
  minifyWhitespace as m,
  phrasing as p
};
