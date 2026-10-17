var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// app-core-shared:react
var require_react = __commonJS({
  "app-core-shared:react"(exports, module) {
    module.exports = globalThis.__APP_CORE_SHARED__["react"];
  }
});

// app-core-shared:react-router-dom
var require_react_router_dom = __commonJS({
  "app-core-shared:react-router-dom"(exports, module) {
    module.exports = globalThis.__APP_CORE_SHARED__["react-router-dom"];
  }
});

// app-core-shared:@wadeck-app/dsl-renderer
var require_dsl_renderer = __commonJS({
  "app-core-shared:@wadeck-app/dsl-renderer"(exports, module) {
    module.exports = globalThis.__APP_CORE_SHARED__["@wadeck-app/dsl-renderer"];
  }
});

// app-core-shared:@wadeck-app/dsl-ui
var require_dsl_ui = __commonJS({
  "app-core-shared:@wadeck-app/dsl-ui"(exports, module) {
    module.exports = globalThis.__APP_CORE_SHARED__["@wadeck-app/dsl-ui"];
  }
});

// packages/test-app-modules/_sources/dsl-lib-fixture/entries.src.mjs
var import_react = __toESM(require_react(), 1);
var import_react_router_dom = __toESM(require_react_router_dom(), 1);
var import_dsl_renderer = __toESM(require_dsl_renderer(), 1);
var import_Badge = __toESM(require_dsl_ui(), 1);
var LABEL = "v1";
function Hello({ who }) {
  return (0, import_react.createElement)(
    "div",
    { className: "dsllib-fixture-hello" },
    (0, import_react.createElement)("span", { id: "dsllib-hello" }, `${LABEL} hello ${who}`),
    (0, import_react.createElement)(import_Badge.Badge, { label: "dsl-ui-badge", variant: "success" })
  );
}
function RouteParam({ id }) {
  const params = (0, import_react_router_dom.useParams)();
  return (0, import_react.createElement)("p", { id: "dsllib-route-param" }, `${LABEL} item=${id} hook=${params.id}`);
}
var entries_src_default = [
  {
    name: "Hello",
    category: "atomic",
    tags: [],
    render: ({ node, ctx }) => (0, import_react.createElement)(Hello, { who: String((0, import_dsl_renderer.resolveExpressionValue)(node["who"], ctx) ?? "") })
  },
  {
    name: "RouteParam",
    category: "atomic",
    tags: [],
    render: ({ node, ctx }) => (0, import_react.createElement)(RouteParam, { id: String((0, import_dsl_renderer.resolveExpressionValue)(node["id"], ctx) ?? "") })
  }
];
export {
  entries_src_default as default
};
