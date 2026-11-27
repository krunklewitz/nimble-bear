import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", "reference", "private"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Architecture: rules/ must stay pure (no React, SDK, storage or platform code).
    files: ["src/rules/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["react", "react-dom", "@owlbear-rodeo/*"], message: "rules/ is pure TypeScript." },
          { group: ["**/platform/**", "**/ui/**"], message: "rules/ must not depend on platform/ or ui/." },
        ],
      }],
      "no-restricted-globals": ["error", "indexedDB", "localStorage", "sessionStorage", "window", "document"],
    },
  },
  {
    // app/ is glue: uses rules/ and platform interfaces, never React, the SDK, or storage directly.
    files: ["src/app/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["react", "react-dom", "@owlbear-rodeo/*"], message: "app/ has no React or SDK code." },
          { group: ["**/ui/**"], message: "app/ must not depend on ui/." },
        ],
      }],
      "no-restricted-globals": ["error", "indexedDB", "localStorage", "sessionStorage", "document"],
    },
  },
  {
    // Only platform/ may talk to Owlbear.
    files: ["src/ui/**/*.{ts,tsx}", "src/data/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@owlbear-rodeo/*"], message: "Only platform/ may import the Owlbear SDK." }],
      }],
    },
  },
  {
    files: ["vite.config.ts", "manifest.config.ts", "eslint.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
);
