import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // jest.config.js is a CommonJS tooling file (module.exports), not
  // application source — same tier as dist/node_modules, not worth adding
  // a Node-globals config block just to lint one config file.
  { ignores: ["dist/**", "node_modules/**", "jest.config.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module"
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
      // False-positives on try/catch-assigned values that are only read
      // after a later conditional reassignment (e.g. admin.ts's per-role
      // `students` normalization) — the rule can't trace that flow.
      "no-useless-assignment": "off"
    }
  }
);
