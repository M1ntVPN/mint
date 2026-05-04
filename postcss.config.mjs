// PostCSS pipeline runs AFTER `@tailwindcss/vite` emits its CSS.
//
// Tailwind v4 wraps every utility / preflight rule in `@layer base`,
// `@layer utilities`, etc. Cascade layers (the @layer at-rule) are a
// 2022 feature — Chrome 99 / Safari 15.4 / Android System WebView 99 —
// and any WebView older than that drops the entire layer block, so on
// such devices Mint's UI renders with zero Tailwind utilities (no
// flex, no grid, no padding, no rounded corners). We saw exactly this
// on a user's Android device on the 0.3.6-android build.
//
// `@csstools/postcss-cascade-layers` rewrites the @layer wrappers into
// equivalent plain rules using specificity hacks (`:not(#\#)` etc.) so
// the cascade ordering still works without needing real layer support
// in the runtime. The trade-off is slightly higher specificity on
// utility classes, which Tailwind users tolerate well in practice.
import cascadeLayers from "@csstools/postcss-cascade-layers";

export default {
  plugins: [cascadeLayers({ onConditionalRulesChangingLayerOrder: "warn" })],
};
