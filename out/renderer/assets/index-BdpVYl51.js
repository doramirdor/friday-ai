import { s as structuredClone, p as position } from "./index-DP-HoFPF.js";
import { m as minifyWhitespace, c as convertElement, p as phrasing$1 } from "./index-DAUtpLsD.js";
import { c as convert, E as EXIT, S as SKIP } from "./index-Db1BflSh.js";
import { p as phrasing$2 } from "./index-BQQO4o33.js";
import { w as whitespace } from "./index-G-ora8YN.js";
import { v as visit } from "./index-DZUfWD1-.js";
import { t as toString } from "./index-cbiyYImb.js";
function rehypeMinifyWhitespace(options) {
  return function(tree) {
    minifyWhitespace(tree, options);
  };
}
function a(state, node) {
  const properties = node.properties || {};
  const children = (
    /** @type {Array<PhrasingContent>} */
    state.all(node)
  );
  const result = {
    type: "link",
    url: state.resolve(String(properties.href || "") || null),
    title: properties.title ? String(properties.title) : null,
    children
  };
  state.patch(node, result);
  return result;
}
function base(state, node) {
  if (!state.baseFound) {
    state.frozenBaseUrl = String(node.properties && node.properties.href || "") || void 0;
    state.baseFound = true;
  }
}
function blockquote(state, node) {
  const result = { type: "blockquote", children: state.toFlow(state.all(node)) };
  state.patch(node, result);
  return result;
}
function br$1(state, node) {
  const result = { type: "break" };
  state.patch(node, result);
  return result;
}
const findAfter = (
  // Note: overloads like this are needed to support optional generics.
  /**
   * @type {(
   *   (<Kind extends UnistParent, Check extends Test>(parent: Kind, index: Child<Kind> | number, test: Check) => Matches<Child<Kind>, Check> | undefined) &
   *   (<Kind extends UnistParent>(parent: Kind, index: Child<Kind> | number, test?: null | undefined) => Child<Kind> | undefined)
   * )}
   */
  /**
   * @param {UnistParent} parent
   * @param {UnistNode | number} index
   * @param {Test} [test]
   * @returns {UnistNode | undefined}
   */
  function(parent, index, test) {
    const is = convert(test);
    if (!parent || !parent.type || !parent.children) {
      throw new Error("Expected parent node");
    }
    if (typeof index === "number") {
      if (index < 0 || index === Number.POSITIVE_INFINITY) {
        throw new Error("Expected positive finite number as index");
      }
    } else {
      index = parent.children.indexOf(index);
      if (index < 0) {
        throw new Error("Expected child node or index");
      }
    }
    while (++index < parent.children.length) {
      if (is(parent.children[index], index, parent)) {
        return parent.children[index];
      }
    }
    return void 0;
  }
);
const searchLineFeeds = /\n/g;
const searchTabOrSpaces = /[\t ]+/g;
const br = convertElement("br");
const cell = convertElement(isCell);
const p$1 = convertElement("p");
const row = convertElement("tr");
const notRendered = convertElement([
  // List from: <https://html.spec.whatwg.org/multipage/rendering.html#hidden-elements>
  "datalist",
  "head",
  "noembed",
  "noframes",
  "noscript",
  // Act as if we support scripting.
  "rp",
  "script",
  "style",
  "template",
  "title",
  // Hidden attribute.
  hidden,
  // From: <https://html.spec.whatwg.org/multipage/rendering.html#flow-content-3>
  closedDialog
]);
const blockOrCaption = convertElement([
  "address",
  // Flow content
  "article",
  // Sections and headings
  "aside",
  // Sections and headings
  "blockquote",
  // Flow content
  "body",
  // Page
  "caption",
  // `table-caption`
  "center",
  // Flow content (legacy)
  "dd",
  // Lists
  "dialog",
  // Flow content
  "dir",
  // Lists (legacy)
  "dl",
  // Lists
  "dt",
  // Lists
  "div",
  // Flow content
  "figure",
  // Flow content
  "figcaption",
  // Flow content
  "footer",
  // Flow content
  "form,",
  // Flow content
  "h1",
  // Sections and headings
  "h2",
  // Sections and headings
  "h3",
  // Sections and headings
  "h4",
  // Sections and headings
  "h5",
  // Sections and headings
  "h6",
  // Sections and headings
  "header",
  // Flow content
  "hgroup",
  // Sections and headings
  "hr",
  // Flow content
  "html",
  // Page
  "legend",
  // Flow content
  "li",
  // Lists (as `display: list-item`)
  "listing",
  // Flow content (legacy)
  "main",
  // Flow content
  "menu",
  // Lists
  "nav",
  // Sections and headings
  "ol",
  // Lists
  "p",
  // Flow content
  "plaintext",
  // Flow content (legacy)
  "pre",
  // Flow content
  "section",
  // Sections and headings
  "ul",
  // Lists
  "xmp"
  // Flow content (legacy)
]);
function toText(tree, options) {
  const options_ = {};
  const children = "children" in tree ? tree.children : [];
  const block = blockOrCaption(tree);
  const whitespace2 = inferWhitespace(tree, {
    whitespace: options_.whitespace || "normal"
  });
  const results = [];
  if (tree.type === "text" || tree.type === "comment") {
    results.push(
      ...collectText(tree, {
        breakBefore: true,
        breakAfter: true
      })
    );
  }
  let index = -1;
  while (++index < children.length) {
    results.push(
      ...renderedTextCollection(
        children[index],
        // @ts-expect-error: `tree` is a parent if we’re here.
        tree,
        {
          whitespace: whitespace2,
          breakBefore: index ? void 0 : block,
          breakAfter: index < children.length - 1 ? br(children[index + 1]) : block
        }
      )
    );
  }
  const result = [];
  let count;
  index = -1;
  while (++index < results.length) {
    const value = results[index];
    if (typeof value === "number") {
      if (count !== void 0 && value > count) count = value;
    } else if (value) {
      if (count !== void 0 && count > -1) {
        result.push("\n".repeat(count) || " ");
      }
      count = -1;
      result.push(value);
    }
  }
  return result.join("");
}
function renderedTextCollection(node, parent, info) {
  if (node.type === "element") {
    return collectElement(node, parent, info);
  }
  if (node.type === "text") {
    return info.whitespace === "normal" ? collectText(node, info) : collectPreText(node);
  }
  return [];
}
function collectElement(node, parent, info) {
  const whitespace2 = inferWhitespace(node, info);
  const children = node.children || [];
  let index = -1;
  let items = [];
  if (notRendered(node)) {
    return items;
  }
  let prefix2;
  let suffix;
  if (br(node)) {
    suffix = "\n";
  } else if (row(node) && // @ts-expect-error: something up with types of parents.
  findAfter(parent, node, row)) {
    suffix = "\n";
  } else if (p$1(node)) {
    prefix2 = 2;
    suffix = 2;
  } else if (blockOrCaption(node)) {
    prefix2 = 1;
    suffix = 1;
  }
  while (++index < children.length) {
    items = items.concat(
      renderedTextCollection(children[index], node, {
        whitespace: whitespace2,
        breakBefore: index ? void 0 : prefix2,
        breakAfter: index < children.length - 1 ? br(children[index + 1]) : suffix
      })
    );
  }
  if (cell(node) && // @ts-expect-error: something up with types of parents.
  findAfter(parent, node, cell)) {
    items.push("	");
  }
  if (prefix2) items.unshift(prefix2);
  if (suffix) items.push(suffix);
  return items;
}
function collectText(node, info) {
  const value = String(node.value);
  const lines = [];
  const result = [];
  let start = 0;
  while (start <= value.length) {
    searchLineFeeds.lastIndex = start;
    const match = searchLineFeeds.exec(value);
    const end = match && "index" in match ? match.index : value.length;
    lines.push(
      // Any sequence of collapsible spaces and tabs immediately preceding or
      // following a segment break is removed.
      trimAndCollapseSpacesAndTabs(
        // […] ignoring bidi formatting characters (characters with the
        // Bidi_Control property [UAX9]: ALM, LTR, RTL, LRE-RLO, LRI-PDI) as if
        // they were not there.
        value.slice(start, end).replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, ""),
        start === 0 ? info.breakBefore : true,
        end === value.length ? info.breakAfter : true
      )
    );
    start = end + 1;
  }
  let index = -1;
  let join;
  while (++index < lines.length) {
    if (lines[index].charCodeAt(lines[index].length - 1) === 8203 || index < lines.length - 1 && lines[index + 1].charCodeAt(0) === 8203) {
      result.push(lines[index]);
      join = void 0;
    } else if (lines[index]) {
      if (typeof join === "number") result.push(join);
      result.push(lines[index]);
      join = 0;
    } else if (index === 0 || index === lines.length - 1) {
      result.push(0);
    }
  }
  return result;
}
function collectPreText(node) {
  return [String(node.value)];
}
function trimAndCollapseSpacesAndTabs(value, breakBefore, breakAfter) {
  const result = [];
  let start = 0;
  let end;
  while (start < value.length) {
    searchTabOrSpaces.lastIndex = start;
    const match = searchTabOrSpaces.exec(value);
    end = match ? match.index : value.length;
    if (!start && !end && match && !breakBefore) {
      result.push("");
    }
    if (start !== end) {
      result.push(value.slice(start, end));
    }
    start = match ? end + match[0].length : end;
  }
  if (start !== end && !breakAfter) {
    result.push("");
  }
  return result.join(" ");
}
function inferWhitespace(node, info) {
  if (node.type === "element") {
    const properties = node.properties || {};
    switch (node.tagName) {
      case "listing":
      case "plaintext":
      case "xmp": {
        return "pre";
      }
      case "nobr": {
        return "nowrap";
      }
      case "pre": {
        return properties.wrap ? "pre-wrap" : "pre";
      }
      case "td":
      case "th": {
        return properties.noWrap ? "nowrap" : info.whitespace;
      }
      case "textarea": {
        return "pre-wrap";
      }
    }
  }
  return info.whitespace;
}
function hidden(node) {
  return Boolean((node.properties || {}).hidden);
}
function isCell(node) {
  return node.tagName === "td" || node.tagName === "th";
}
function closedDialog(node) {
  return node.tagName === "dialog" && !(node.properties || {}).open;
}
function trimTrailingLines(value) {
  const input2 = String(value);
  let end = input2.length;
  while (end > 0) {
    const code2 = input2.codePointAt(end - 1);
    if (code2 !== void 0 && (code2 === 10 || code2 === 13)) {
      end--;
    } else {
      break;
    }
  }
  return input2.slice(0, end);
}
const prefix = "language-";
function code(state, node) {
  const children = node.children;
  let index = -1;
  let classList;
  let lang;
  if (node.tagName === "pre") {
    while (++index < children.length) {
      const child = children[index];
      if (child.type === "element" && child.tagName === "code" && child.properties && child.properties.className && Array.isArray(child.properties.className)) {
        classList = child.properties.className;
        break;
      }
    }
  }
  if (classList) {
    index = -1;
    while (++index < classList.length) {
      if (String(classList[index]).slice(0, prefix.length) === prefix) {
        lang = String(classList[index]).slice(prefix.length);
        break;
      }
    }
  }
  const result = {
    type: "code",
    lang: lang || null,
    meta: null,
    value: trimTrailingLines(toText(node))
  };
  state.patch(node, result);
  return result;
}
function comment(state, node) {
  const result = {
    type: "html",
    value: "<!--" + node.value + "-->"
  };
  state.patch(node, result);
  return result;
}
function del(state, node) {
  const children = (
    /** @type {Array<PhrasingContent>} */
    state.all(node)
  );
  const result = { type: "delete", children };
  state.patch(node, result);
  return result;
}
function listItemsSpread(children) {
  let index = -1;
  if (children.length > 1) {
    while (++index < children.length) {
      if (children[index].spread) {
        return true;
      }
    }
  }
  return false;
}
function dl(state, node) {
  const clean = [];
  const groups = [];
  let index = -1;
  while (++index < node.children.length) {
    const child = node.children[index];
    if (child.type === "element" && child.tagName === "div") {
      clean.push(...child.children);
    } else {
      clean.push(child);
    }
  }
  let group = { definitions: [], titles: [] };
  index = -1;
  while (++index < clean.length) {
    const child = clean[index];
    if (child.type === "element" && child.tagName === "dt") {
      const previous = clean[index - 1];
      if (previous && previous.type === "element" && previous.tagName === "dd") {
        groups.push(group);
        group = { definitions: [], titles: [] };
      }
      group.titles.push(child);
    } else {
      group.definitions.push(child);
    }
  }
  groups.push(group);
  index = -1;
  const content = [];
  while (++index < groups.length) {
    const result = [
      ...handle(state, groups[index].titles),
      ...handle(state, groups[index].definitions)
    ];
    if (result.length > 0) {
      content.push({
        type: "listItem",
        spread: result.length > 1,
        checked: null,
        children: result
      });
    }
  }
  if (content.length > 0) {
    const result = {
      type: "list",
      ordered: false,
      start: null,
      spread: listItemsSpread(content),
      children: content
    };
    state.patch(node, result);
    return result;
  }
}
function handle(state, children) {
  const nodes = state.all({ type: "root", children });
  const listItems = state.toSpecificContent(nodes, create$2);
  if (listItems.length === 0) {
    return [];
  }
  if (listItems.length === 1) {
    return listItems[0].children;
  }
  return [
    {
      type: "list",
      ordered: false,
      start: null,
      spread: listItemsSpread(listItems),
      children: listItems
    }
  ];
}
function create$2() {
  return { type: "listItem", spread: false, checked: null, children: [] };
}
function em(state, node) {
  const children = (
    /** @type {Array<PhrasingContent>} */
    state.all(node)
  );
  const result = { type: "emphasis", children };
  state.patch(node, result);
  return result;
}
function dropSurroundingBreaks(nodes) {
  let start = 0;
  let end = nodes.length;
  while (start < end && nodes[start].type === "break") start++;
  while (end > start && nodes[end - 1].type === "break") end--;
  return start === 0 && end === nodes.length ? nodes : nodes.slice(start, end);
}
function heading(state, node) {
  const depth = (
    /** @type {Heading['depth']} */
    /* c8 ignore next */
    Number(node.tagName.charAt(1)) || 1
  );
  const children = dropSurroundingBreaks(
    /** @type {Array<PhrasingContent>} */
    state.all(node)
  );
  const result = { type: "heading", depth, children };
  state.patch(node, result);
  return result;
}
function hr(state, node) {
  const result = { type: "thematicBreak" };
  state.patch(node, result);
  return result;
}
function iframe(state, node) {
  const properties = node.properties || {};
  const source = String(properties.src || "");
  const title = String(properties.title || "");
  if (source && title) {
    const result = {
      type: "link",
      title: null,
      url: state.resolve(source),
      children: [{ type: "text", value: title }]
    };
    state.patch(node, result);
    return result;
  }
}
function img(state, node) {
  const properties = node.properties || {};
  const result = {
    type: "image",
    url: state.resolve(String(properties.src || "") || null),
    title: properties.title ? String(properties.title) : null,
    alt: properties.alt ? String(properties.alt) : ""
  };
  state.patch(node, result);
  return result;
}
function inlineCode(state, node) {
  const result = { type: "inlineCode", value: toText(node) };
  state.patch(node, result);
  return result;
}
function findSelectedOptions(node, explicitProperties) {
  const selectedOptions = [];
  const values = [];
  const properties = explicitProperties || node.properties || {};
  const options = findOptions(node);
  const size = Math.min(Number.parseInt(String(properties.size), 10), 0) || (properties.multiple ? 4 : 1);
  let index = -1;
  while (++index < options.length) {
    const option = options[index];
    if (option && option.properties && option.properties.selected) {
      selectedOptions.push(option);
    }
  }
  const list2 = selectedOptions.length > 0 ? selectedOptions : options;
  const max = Math.min(list2.length, size);
  index = -1;
  while (++index < max) {
    const option = list2[index];
    const properties2 = option.properties || {};
    const content = toText(option);
    const label = content || String(properties2.label || "");
    const value = String(properties2.value || "") || content;
    values.push([value, label === value ? void 0 : label]);
  }
  return values;
}
function findOptions(node) {
  const results = [];
  let index = -1;
  while (++index < node.children.length) {
    const child = node.children[index];
    if ("children" in child && Array.isArray(child.children)) {
      results.push(...findOptions(child));
    }
    if (child.type === "element" && child.tagName === "option" && (!child.properties || !child.properties.disabled)) {
      results.push(child);
    }
  }
  return results;
}
const defaultChecked = "[x]";
const defaultUnchecked = "[ ]";
function input(state, node) {
  const properties = node.properties || {};
  const value = String(properties.value || properties.placeholder || "");
  if (properties.disabled || properties.type === "hidden" || properties.type === "file") {
    return;
  }
  if (properties.type === "checkbox" || properties.type === "radio") {
    const result2 = {
      type: "text",
      value: properties.checked ? state.options.checked || defaultChecked : state.options.unchecked || defaultUnchecked
    };
    state.patch(node, result2);
    return result2;
  }
  if (properties.type === "image") {
    const alt = properties.alt || value;
    if (alt) {
      const result2 = {
        type: "image",
        url: state.resolve(String(properties.src || "") || null),
        title: String(properties.title || "") || null,
        alt: String(alt)
      };
      state.patch(node, result2);
      return result2;
    }
    return;
  }
  let values = [];
  if (value) {
    values = [[value, void 0]];
  } else if (
    // `list` is not supported on these types:
    properties.type !== "button" && properties.type !== "file" && properties.type !== "password" && properties.type !== "reset" && properties.type !== "submit" && properties.list
  ) {
    const list2 = String(properties.list);
    const datalist = state.elementById.get(list2);
    if (datalist && datalist.tagName === "datalist") {
      values = findSelectedOptions(datalist, properties);
    }
  }
  if (values.length === 0) {
    return;
  }
  if (properties.type === "password") {
    values[0] = ["•".repeat(values[0][0].length), void 0];
  }
  if (properties.type === "email" || properties.type === "url") {
    const results = [];
    let index2 = -1;
    while (++index2 < values.length) {
      const value2 = state.resolve(values[index2][0]);
      const result2 = {
        type: "link",
        title: null,
        url: properties.type === "email" ? "mailto:" + value2 : value2,
        children: [{ type: "text", value: values[index2][1] || value2 }]
      };
      results.push(result2);
      if (index2 !== values.length - 1) {
        results.push({ type: "text", value: ", " });
      }
    }
    return results;
  }
  const texts = [];
  let index = -1;
  while (++index < values.length) {
    texts.push(
      values[index][1] ? values[index][1] + " (" + values[index][0] + ")" : values[index][0]
    );
  }
  const result = { type: "text", value: texts.join(", ") };
  state.patch(node, result);
  return result;
}
function li(state, node) {
  const { rest, checkbox } = extractLeadingCheckbox(node);
  const checked = checkbox ? Boolean(checkbox.properties.checked) : null;
  const spread = spreadout(rest);
  const children = state.toFlow(state.all(rest));
  const result = { type: "listItem", spread, checked, children };
  state.patch(node, result);
  return result;
}
function spreadout(node) {
  let index = -1;
  let seenFlow = false;
  while (++index < node.children.length) {
    const child = node.children[index];
    if (child.type === "element") {
      if (phrasing$1(child)) continue;
      if (child.tagName === "p" || seenFlow || spreadout(child)) {
        return true;
      }
      seenFlow = true;
    }
  }
  return false;
}
function extractLeadingCheckbox(node) {
  const head = node.children[0];
  if (head && head.type === "element" && head.tagName === "input" && head.properties && (head.properties.type === "checkbox" || head.properties.type === "radio")) {
    const rest = { ...node, children: node.children.slice(1) };
    return { checkbox: head, rest };
  }
  if (head && head.type === "element" && head.tagName === "p") {
    const { checkbox, rest: restHead } = extractLeadingCheckbox(head);
    if (checkbox) {
      const rest = { ...node, children: [restHead, ...node.children.slice(1)] };
      return { checkbox, rest };
    }
  }
  return { checkbox: void 0, rest: node };
}
function list(state, node) {
  const ordered = node.tagName === "ol";
  const children = state.toSpecificContent(state.all(node), create$1);
  let start = null;
  if (ordered) {
    start = node.properties && node.properties.start ? Number.parseInt(String(node.properties.start), 10) : 1;
  }
  const result = {
    type: "list",
    ordered,
    start,
    spread: listItemsSpread(children),
    children
  };
  state.patch(node, result);
  return result;
}
function create$1() {
  return { type: "listItem", spread: false, checked: null, children: [] };
}
function wrapNeeded(nodes) {
  let index = -1;
  while (++index < nodes.length) {
    const node = nodes[index];
    if (!phrasing(node) || "children" in node && wrapNeeded(node.children)) {
      return true;
    }
  }
  return false;
}
function wrap(nodes) {
  return runs(nodes, onphrasing, function(d) {
    return d;
  });
  function onphrasing(nodes2) {
    return nodes2.every(function(d) {
      return d.type === "text" ? whitespace(d.value) : false;
    }) ? [] : [{ type: "paragraph", children: dropSurroundingBreaks(nodes2) }];
  }
}
function split(node) {
  return runs(node.children, onphrasing, onnonphrasing);
  function onphrasing(nodes) {
    const newParent = cloneWithoutChildren(node);
    newParent.children = nodes;
    return [newParent];
  }
  function onnonphrasing(child) {
    if ("children" in child && "children" in node) {
      const newParent = cloneWithoutChildren(node);
      const newChild = cloneWithoutChildren(child);
      newParent.children = child.children;
      newChild.children.push(newParent);
      return newChild;
    }
    return { ...child };
  }
}
function runs(nodes, onphrasing, onnonphrasing) {
  const flattened = flatten(nodes);
  const result = [];
  let queue = [];
  let index = -1;
  while (++index < flattened.length) {
    const node = flattened[index];
    if (phrasing(node)) {
      queue.push(node);
    } else {
      if (queue.length > 0) {
        result.push(...onphrasing(queue));
        queue = [];
      }
      result.push(onnonphrasing(node));
    }
  }
  if (queue.length > 0) {
    result.push(...onphrasing(queue));
    queue = [];
  }
  return result;
}
function flatten(nodes) {
  const flattened = [];
  let index = -1;
  while (++index < nodes.length) {
    const node = nodes[index];
    if ((node.type === "delete" || node.type === "link") && wrapNeeded(node.children)) {
      flattened.push(...split(node));
    } else {
      flattened.push(node);
    }
  }
  return flattened;
}
function phrasing(node) {
  const tagName = node.data && node.data.hName;
  return tagName ? phrasing$1({ type: "element", tagName, properties: {}, children: [] }) : phrasing$2(node);
}
function cloneWithoutChildren(node) {
  return structuredClone({ ...node, children: [] });
}
function media(state, node) {
  const properties = node.properties || {};
  const poster = node.tagName === "video" ? String(properties.poster || "") : "";
  let source = String(properties.src || "");
  let index = -1;
  let linkInFallbackContent = false;
  let nodes = state.all(node);
  const fragment = { type: "root", children: nodes };
  visit(fragment, function(node2) {
    if (node2.type === "link") {
      linkInFallbackContent = true;
      return EXIT;
    }
  });
  if (linkInFallbackContent || wrapNeeded(nodes)) {
    return nodes;
  }
  while (!source && ++index < node.children.length) {
    const child = node.children[index];
    if (child.type === "element" && child.tagName === "source" && child.properties) {
      source = String(child.properties.src || "");
    }
  }
  if (poster) {
    const image = {
      type: "image",
      title: null,
      url: state.resolve(poster),
      alt: toString(nodes)
    };
    state.patch(node, image);
    nodes = [image];
  }
  const children = (
    /** @type {Array<PhrasingContent>} */
    nodes
  );
  const result = {
    type: "link",
    title: properties.title ? String(properties.title) : null,
    url: state.resolve(source),
    children
  };
  state.patch(node, result);
  return result;
}
function p(state, node) {
  const children = dropSurroundingBreaks(
    // Allow potentially “invalid” nodes, they might be unknown.
    // We also support straddling later.
    /** @type {Array<PhrasingContent>} */
    state.all(node)
  );
  if (children.length > 0) {
    const result = { type: "paragraph", children };
    state.patch(node, result);
    return result;
  }
}
const defaultQuotes = ['"'];
function q(state, node) {
  const quotes = state.options.quotes || defaultQuotes;
  state.qNesting++;
  const contents = state.all(node);
  state.qNesting--;
  const quote = quotes[state.qNesting % quotes.length];
  const head = contents[0];
  const tail = contents[contents.length - 1];
  const open = quote.charAt(0);
  const close = quote.length > 1 ? quote.charAt(1) : quote;
  if (head && head.type === "text") {
    head.value = open + head.value;
  } else {
    contents.unshift({ type: "text", value: open });
  }
  if (tail && tail.type === "text") {
    tail.value += close;
  } else {
    contents.push({ type: "text", value: close });
  }
  return contents;
}
function root(state, node) {
  let children = state.all(node);
  if (state.options.document || wrapNeeded(children)) {
    children = wrap(children);
  }
  const result = { type: "root", children };
  state.patch(node, result);
  return result;
}
function select(state, node) {
  const values = findSelectedOptions(node);
  let index = -1;
  const results = [];
  while (++index < values.length) {
    const value = values[index];
    results.push(value[1] ? value[1] + " (" + value[0] + ")" : value[0]);
  }
  if (results.length > 0) {
    const result = { type: "text", value: results.join(", ") };
    state.patch(node, result);
    return result;
  }
}
function strong(state, node) {
  const children = (
    /** @type {Array<PhrasingContent>} */
    state.all(node)
  );
  const result = { type: "strong", children };
  state.patch(node, result);
  return result;
}
function tableCell(state, node) {
  const children = (
    /** @type {Array<PhrasingContent>} */
    state.all(node)
  );
  const result = { type: "tableCell", children };
  state.patch(node, result);
  if (node.properties) {
    const rowSpan = node.properties.rowSpan;
    const colSpan = node.properties.colSpan;
    if (rowSpan || colSpan) {
      const data = (
        /** @type {Record<string, unknown>} */
        result.data || (result.data = {})
      );
      if (rowSpan) data.hastUtilToMdastTemporaryRowSpan = rowSpan;
      if (colSpan) data.hastUtilToMdastTemporaryColSpan = colSpan;
    }
  }
  return result;
}
function tableRow(state, node) {
  const children = state.toSpecificContent(state.all(node), create);
  const result = { type: "tableRow", children };
  state.patch(node, result);
  return result;
}
function create() {
  return { type: "tableCell", children: [] };
}
function table(state, node) {
  if (state.inTable) {
    const result2 = { type: "text", value: toText(node) };
    state.patch(node, result2);
    return result2;
  }
  state.inTable = true;
  const { align, headless } = inspect(node);
  const rows = state.toSpecificContent(state.all(node), createRow);
  if (headless) {
    rows.unshift(createRow());
  }
  let rowIndex = -1;
  while (++rowIndex < rows.length) {
    const row2 = rows[rowIndex];
    const cells = state.toSpecificContent(row2.children, createCell);
    row2.children = cells;
  }
  let columns = 1;
  rowIndex = -1;
  while (++rowIndex < rows.length) {
    const cells = rows[rowIndex].children;
    let cellIndex = -1;
    while (++cellIndex < cells.length) {
      const cell2 = cells[cellIndex];
      if (cell2.data) {
        const data = (
          /** @type {Record<string, unknown>} */
          cell2.data
        );
        const colSpan = Number.parseInt(String(data.hastUtilToMdastTemporaryColSpan), 10) || 1;
        const rowSpan = Number.parseInt(String(data.hastUtilToMdastTemporaryRowSpan), 10) || 1;
        if (colSpan > 1 || rowSpan > 1) {
          let otherRowIndex = rowIndex - 1;
          while (++otherRowIndex < rowIndex + rowSpan) {
            let colIndex = cellIndex - 1;
            while (++colIndex < cellIndex + colSpan) {
              if (!rows[otherRowIndex]) {
                break;
              }
              const newCells = [];
              if (otherRowIndex !== rowIndex || colIndex !== cellIndex) {
                newCells.push({ type: "tableCell", children: [] });
              }
              rows[otherRowIndex].children.splice(colIndex, 0, ...newCells);
            }
          }
        }
        if ("hastUtilToMdastTemporaryColSpan" in cell2.data)
          delete cell2.data.hastUtilToMdastTemporaryColSpan;
        if ("hastUtilToMdastTemporaryRowSpan" in cell2.data)
          delete cell2.data.hastUtilToMdastTemporaryRowSpan;
        if (Object.keys(cell2.data).length === 0) delete cell2.data;
      }
    }
    if (cells.length > columns) columns = cells.length;
  }
  rowIndex = -1;
  while (++rowIndex < rows.length) {
    const cells = rows[rowIndex].children;
    let cellIndex = cells.length - 1;
    while (++cellIndex < columns) {
      cells.push({ type: "tableCell", children: [] });
    }
  }
  let alignIndex = align.length - 1;
  while (++alignIndex < columns) {
    align.push(null);
  }
  state.inTable = false;
  const result = { type: "table", align, children: rows };
  state.patch(node, result);
  return result;
}
function inspect(node) {
  const info = { align: [null], headless: true };
  let rowIndex = 0;
  let cellIndex = 0;
  visit(node, function(child) {
    if (child.type === "element") {
      if (child.tagName === "table" && node !== child) {
        return SKIP;
      }
      if ((child.tagName === "th" || child.tagName === "td") && child.properties) {
        if (!info.align[cellIndex]) {
          const value = String(child.properties.align || "") || null;
          if (value === "center" || value === "left" || value === "right" || value === null) {
            info.align[cellIndex] = value;
          }
        }
        if (info.headless && rowIndex < 2 && child.tagName === "th") {
          info.headless = false;
        }
        cellIndex++;
      } else if (child.tagName === "thead") {
        info.headless = false;
      } else if (child.tagName === "tr") {
        rowIndex++;
        cellIndex = 0;
      }
    }
  });
  return info;
}
function createCell() {
  return { type: "tableCell", children: [] };
}
function createRow() {
  return { type: "tableRow", children: [] };
}
function text(state, node) {
  const result = { type: "text", value: node.value };
  state.patch(node, result);
  return result;
}
function textarea(state, node) {
  const result = { type: "text", value: toText(node) };
  state.patch(node, result);
  return result;
}
function wbr(state, node) {
  const result = { type: "text", value: "​" };
  state.patch(node, result);
  return result;
}
const nodeHandlers = {
  comment,
  doctype: ignore,
  root,
  text
};
const handlers = {
  // Ignore:
  applet: ignore,
  area: ignore,
  basefont: ignore,
  bgsound: ignore,
  caption: ignore,
  col: ignore,
  colgroup: ignore,
  command: ignore,
  content: ignore,
  datalist: ignore,
  dialog: ignore,
  element: ignore,
  embed: ignore,
  frame: ignore,
  frameset: ignore,
  isindex: ignore,
  keygen: ignore,
  link: ignore,
  math: ignore,
  menu: ignore,
  menuitem: ignore,
  meta: ignore,
  nextid: ignore,
  noembed: ignore,
  noframes: ignore,
  optgroup: ignore,
  option: ignore,
  param: ignore,
  script: ignore,
  shadow: ignore,
  source: ignore,
  spacer: ignore,
  style: ignore,
  svg: ignore,
  template: ignore,
  title: ignore,
  track: ignore,
  // Use children:
  abbr: all$1,
  acronym: all$1,
  bdi: all$1,
  bdo: all$1,
  big: all$1,
  blink: all$1,
  button: all$1,
  canvas: all$1,
  cite: all$1,
  data: all$1,
  details: all$1,
  dfn: all$1,
  font: all$1,
  ins: all$1,
  label: all$1,
  map: all$1,
  marquee: all$1,
  meter: all$1,
  nobr: all$1,
  noscript: all$1,
  object: all$1,
  output: all$1,
  progress: all$1,
  rb: all$1,
  rbc: all$1,
  rp: all$1,
  rt: all$1,
  rtc: all$1,
  ruby: all$1,
  slot: all$1,
  small: all$1,
  span: all$1,
  sup: all$1,
  sub: all$1,
  tbody: all$1,
  tfoot: all$1,
  thead: all$1,
  time: all$1,
  // Use children as flow.
  address: flow,
  article: flow,
  aside: flow,
  body: flow,
  center: flow,
  div: flow,
  fieldset: flow,
  figcaption: flow,
  figure: flow,
  form: flow,
  footer: flow,
  header: flow,
  hgroup: flow,
  html: flow,
  legend: flow,
  main: flow,
  multicol: flow,
  nav: flow,
  picture: flow,
  section: flow,
  // Handle.
  a,
  audio: media,
  b: strong,
  base,
  blockquote,
  br: br$1,
  code: inlineCode,
  dir: list,
  dl,
  dt: li,
  dd: li,
  del,
  em,
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  h5: heading,
  h6: heading,
  hr,
  i: em,
  iframe,
  img,
  image: img,
  input,
  kbd: inlineCode,
  li,
  listing: code,
  mark: em,
  ol: list,
  p,
  plaintext: code,
  pre: code,
  q,
  s: del,
  samp: inlineCode,
  select,
  strike: del,
  strong,
  summary: p,
  table,
  td: tableCell,
  textarea,
  th: tableCell,
  tr: tableRow,
  tt: inlineCode,
  u: em,
  ul: list,
  var: inlineCode,
  video: media,
  wbr,
  xmp: code
};
function all$1(state, node) {
  return state.all(node);
}
function flow(state, node) {
  return state.toFlow(state.all(node));
}
function ignore() {
}
const own = {}.hasOwnProperty;
function createState(options) {
  return {
    all,
    baseFound: false,
    elementById: /* @__PURE__ */ new Map(),
    frozenBaseUrl: void 0,
    handlers: { ...handlers, ...options.handlers },
    inTable: false,
    nodeHandlers: { ...nodeHandlers, ...options.nodeHandlers },
    one,
    options,
    patch,
    qNesting: 0,
    resolve,
    toFlow,
    toSpecificContent
  };
}
function all(parent) {
  const children = parent.children || [];
  const results = [];
  let index = -1;
  while (++index < children.length) {
    const child = children[index];
    const result = (
      /** @type {Array<MdastRootContent> | MdastRootContent | undefined} */
      this.one(child, parent)
    );
    if (Array.isArray(result)) {
      results.push(...result);
    } else if (result) {
      results.push(result);
    }
  }
  return results;
}
function one(node, parent) {
  if (node.type === "element") {
    if (node.properties && node.properties.dataMdast === "ignore") {
      return;
    }
    if (own.call(this.handlers, node.tagName)) {
      return this.handlers[node.tagName](this, node, parent) || void 0;
    }
  } else if (own.call(this.nodeHandlers, node.type)) {
    return this.nodeHandlers[node.type](this, node, parent) || void 0;
  }
  if ("value" in node && typeof node.value === "string") {
    const result = { type: "text", value: node.value };
    this.patch(node, result);
    return result;
  }
  if ("children" in node) {
    return this.all(node);
  }
}
function patch(origin, node) {
  if (origin.position) node.position = position(origin);
}
function resolve(url) {
  const base2 = this.frozenBaseUrl;
  if (url === null || url === void 0) {
    return "";
  }
  if (base2) {
    return String(new URL(url, base2));
  }
  return url;
}
function toFlow(nodes) {
  return wrap(nodes);
}
function toSpecificContent(nodes, build) {
  const reference = build();
  const results = [];
  let queue = [];
  let index = -1;
  while (++index < nodes.length) {
    const node = nodes[index];
    if (expectedParent(node)) {
      if (queue.length > 0) {
        node.children.unshift(...queue);
        queue = [];
      }
      results.push(node);
    } else {
      const child = (
        /** @type {ChildType} */
        node
      );
      queue.push(child);
    }
  }
  if (queue.length > 0) {
    let node = results[results.length - 1];
    if (!node) {
      node = build();
      results.push(node);
    }
    node.children.push(...queue);
    queue = [];
  }
  return results;
  function expectedParent(node) {
    return node.type === reference.type;
  }
}
const emptyOptions = {};
function toMdast(tree, options) {
  const cleanTree = structuredClone(tree);
  const settings = options || emptyOptions;
  const transformWhitespace = rehypeMinifyWhitespace({
    newlines: settings.newlines === true
  });
  const state = createState(settings);
  let mdast;
  transformWhitespace(cleanTree);
  visit(cleanTree, function(node) {
    if (node && node.type === "element" && node.properties) {
      const id = String(node.properties.id || "") || void 0;
      if (id && !state.elementById.has(id)) {
        state.elementById.set(id, node);
      }
    }
  });
  const result = state.one(cleanTree, void 0);
  if (!result) {
    mdast = { type: "root", children: [] };
  } else if (Array.isArray(result)) {
    const children = (
      /** @type {Array<MdastRootContent>} */
      result
    );
    mdast = { type: "root", children };
  } else {
    mdast = result;
  }
  visit(mdast, function(node, index, parent) {
    if (node.type === "text" && index !== void 0 && parent) {
      const previous = parent.children[index - 1];
      if (previous && previous.type === node.type) {
        previous.value += node.value;
        parent.children.splice(index, 1);
        if (previous.position && node.position) {
          previous.position.end = node.position.end;
        }
        return index - 1;
      }
      node.value = node.value.replace(/[\t ]*(\r?\n|\r)[\t ]*/, "$1");
      if (parent && (parent.type === "heading" || parent.type === "paragraph" || parent.type === "root")) {
        if (!index) {
          node.value = node.value.replace(/^[\t ]+/, "");
        }
        if (index === parent.children.length - 1) {
          node.value = node.value.replace(/[\t ]+$/, "");
        }
      }
      if (!node.value) {
        parent.children.splice(index, 1);
        return index;
      }
    }
  });
  return mdast;
}
const defaults = { document: true };
function rehypeRemark(destination, options) {
  if (destination && "run" in destination) {
    return async function(tree, file) {
      const mdastTree = toMdast(tree, { ...defaults, ...options });
      await destination.run(mdastTree, file);
    };
  }
  return function(tree) {
    return (
      /** @type {MdastRoot} */
      toMdast(tree, { ...defaults, ...destination })
    );
  };
}
export {
  rehypeRemark as default
};
