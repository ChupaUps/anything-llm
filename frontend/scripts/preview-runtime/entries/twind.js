import { twind, cssom, observe } from "@twind/core";
import presetTailwind from "@twind/preset-tailwind";

// `cssom()` with no argument creates (or claims) the shared <style> element
// and uses its CSSStyleSheet; passing `document` would resolve `document.sheet`.
const tw = twind({ presets: [presetTailwind()] }, cssom());
observe(tw, document.documentElement);
