import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactRefresh.configs.vite,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser
    },
    plugins: {
      "react-hooks": reactHooks
    },
    rules: {
      // Just the long-standing, stable hooks rules — not the newer React
      // Compiler-oriented rule set (purity/immutability/etc.), which this
      // codebase wasn't written against and would be noisy without intent.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
      // Downgraded from the preset's "error" — a couple of existing files
      // (AuthContext, SearchSort) knowingly export a non-component
      // alongside a component; that's a real Fast Refresh caveat, not
      // something that should fail the lint script.
      "react-refresh/only-export-components": "warn"
    }
  }
);
