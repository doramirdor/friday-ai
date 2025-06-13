import { w as webNamespaces } from "./index-BmUztF0Q.js";
import { f as find, p as parse, a as parse$1, n as normalize, h as html, s as svg } from "./index-d8Q-uoc3.js";
const search = /[#.]/g;
function parseSelector(selector, defaultTagName) {
  const value = selector || "";
  const props = {};
  let start = 0;
  let previous;
  let tagName;
  while (start < value.length) {
    search.lastIndex = start;
    const match = search.exec(value);
    const subvalue = value.slice(start, match ? match.index : value.length);
    if (subvalue) {
      if (!previous) {
        tagName = subvalue;
      } else if (previous === "#") {
        props.id = subvalue;
      } else if (Array.isArray(props.className)) {
        props.className.push(subvalue);
      } else {
        props.className = [subvalue];
      }
      start += subvalue.length;
    }
    if (match) {
      previous = match[0];
      start++;
    }
  }
  return {
    type: "element",
    // @ts-expect-error: tag name is parsed.
    tagName: tagName || defaultTagName || "div",
    properties: props,
    children: []
  };
}
function createH(schema, defaultTagName, caseSensitive) {
  const adjust = caseSensitive ? createAdjustMap(caseSensitive) : void 0;
  function h2(selector, properties, ...children) {
    let node;
    if (selector === null || selector === void 0) {
      node = { type: "root", children: [] };
      const child = (
        /** @type {Child} */
        properties
      );
      children.unshift(child);
    } else {
      node = parseSelector(selector, defaultTagName);
      const lower = node.tagName.toLowerCase();
      const adjusted = adjust ? adjust.get(lower) : void 0;
      node.tagName = adjusted || lower;
      if (isChild(properties)) {
        children.unshift(properties);
      } else {
        for (const [key, value] of Object.entries(properties)) {
          addProperty(schema, node.properties, key, value);
        }
      }
    }
    for (const child of children) {
      addChild(node.children, child);
    }
    if (node.type === "element" && node.tagName === "template") {
      node.content = { type: "root", children: node.children };
      node.children = [];
    }
    return node;
  }
  return h2;
}
function isChild(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return true;
  }
  if (typeof value.type !== "string") return false;
  const record = (
    /** @type {Record<string, unknown>} */
    value
  );
  const keys = Object.keys(value);
  for (const key of keys) {
    const value2 = record[key];
    if (value2 && typeof value2 === "object") {
      if (!Array.isArray(value2)) return true;
      const list = (
        /** @type {ReadonlyArray<unknown>} */
        value2
      );
      for (const item of list) {
        if (typeof item !== "number" && typeof item !== "string") {
          return true;
        }
      }
    }
  }
  if ("children" in value && Array.isArray(value.children)) {
    return true;
  }
  return false;
}
function addProperty(schema, properties, key, value) {
  const info = find(schema, key);
  let result;
  if (value === null || value === void 0) return;
  if (typeof value === "number") {
    if (Number.isNaN(value)) return;
    result = value;
  } else if (typeof value === "boolean") {
    result = value;
  } else if (typeof value === "string") {
    if (info.spaceSeparated) {
      result = parse(value);
    } else if (info.commaSeparated) {
      result = parse$1(value);
    } else if (info.commaOrSpaceSeparated) {
      result = parse(parse$1(value).join(" "));
    } else {
      result = parsePrimitive(info, info.property, value);
    }
  } else if (Array.isArray(value)) {
    result = [...value];
  } else {
    result = info.property === "style" ? style(value) : String(value);
  }
  if (Array.isArray(result)) {
    const finalResult = [];
    for (const item of result) {
      finalResult.push(
        /** @type {number | string} */
        parsePrimitive(info, info.property, item)
      );
    }
    result = finalResult;
  }
  if (info.property === "className" && Array.isArray(properties.className)) {
    result = properties.className.concat(
      /** @type {Array<number | string> | number | string} */
      result
    );
  }
  properties[info.property] = result;
}
function addChild(nodes, value) {
  if (value === null || value === void 0) ;
  else if (typeof value === "number" || typeof value === "string") {
    nodes.push({ type: "text", value: String(value) });
  } else if (Array.isArray(value)) {
    for (const child of value) {
      addChild(nodes, child);
    }
  } else if (typeof value === "object" && "type" in value) {
    if (value.type === "root") {
      addChild(nodes, value.children);
    } else {
      nodes.push(value);
    }
  } else {
    throw new Error("Expected node, nodes, or string, got `" + value + "`");
  }
}
function parsePrimitive(info, name, value) {
  if (typeof value === "string") {
    if (info.number && value && !Number.isNaN(Number(value))) {
      return Number(value);
    }
    if ((info.boolean || info.overloadedBoolean) && (value === "" || normalize(value) === normalize(name))) {
      return true;
    }
  }
  return value;
}
function style(styles) {
  const result = [];
  for (const [key, value] of Object.entries(styles)) {
    result.push([key, value].join(": "));
  }
  return result.join("; ");
}
function createAdjustMap(values) {
  const result = /* @__PURE__ */ new Map();
  for (const value of values) {
    result.set(value.toLowerCase(), value);
  }
  return result;
}
const svgCaseSensitiveTagNames = [
  "altGlyph",
  "altGlyphDef",
  "altGlyphItem",
  "animateColor",
  "animateMotion",
  "animateTransform",
  "clipPath",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feDropShadow",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "foreignObject",
  "glyphRef",
  "linearGradient",
  "radialGradient",
  "solidColor",
  "textArea",
  "textPath"
];
const h = createH(html, "div");
const s = createH(svg, "g", svgCaseSensitiveTagNames);
function fromDom(tree, options) {
  return transform(tree, options || {}) || { type: "root", children: [] };
}
function transform(node, options) {
  const transformed = one(node, options);
  if (transformed && options.afterTransform)
    options.afterTransform(node, transformed);
  return transformed;
}
function one(node, options) {
  switch (node.nodeType) {
    case 1: {
      const domNode = (
        /** @type {Element} */
        node
      );
      return element(domNode, options);
    }
    // Ignore: Attr (2).
    case 3: {
      const domNode = (
        /** @type {Text} */
        node
      );
      return text(domNode);
    }
    // Ignore: CDATA (4).
    // Removed: Entity reference (5)
    // Removed: Entity (6)
    // Ignore: Processing instruction (7).
    case 8: {
      const domNode = (
        /** @type {Comment} */
        node
      );
      return comment(domNode);
    }
    case 9: {
      const domNode = (
        /** @type {Document} */
        node
      );
      return root(domNode, options);
    }
    case 10: {
      return doctype();
    }
    case 11: {
      const domNode = (
        /** @type {DocumentFragment} */
        node
      );
      return root(domNode, options);
    }
    default: {
      return void 0;
    }
  }
}
function root(node, options) {
  return { type: "root", children: all(node, options) };
}
function doctype() {
  return { type: "doctype" };
}
function text(node) {
  return { type: "text", value: node.nodeValue || "" };
}
function comment(node) {
  return { type: "comment", value: node.nodeValue || "" };
}
function element(node, options) {
  const space = node.namespaceURI;
  const x = space === webNamespaces.svg ? s : h;
  const tagName = space === webNamespaces.html ? node.tagName.toLowerCase() : node.tagName;
  const content = (
    // @ts-expect-error: DOM types are wrong, content can exist.
    space === webNamespaces.html && tagName === "template" ? node.content : node
  );
  const attributes = node.getAttributeNames();
  const properties = {};
  let index = -1;
  while (++index < attributes.length) {
    properties[attributes[index]] = node.getAttribute(attributes[index]) || "";
  }
  return x(tagName, properties, all(content, options));
}
function all(node, options) {
  const nodes = node.childNodes;
  const children = [];
  let index = -1;
  while (++index < nodes.length) {
    const child = transform(nodes[index], options);
    if (child !== void 0) {
      children.push(child);
    }
  }
  return children;
}
export {
  fromDom
};
