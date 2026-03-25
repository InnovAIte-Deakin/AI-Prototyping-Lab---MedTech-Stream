/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parserOptions: { ecmaVersion: 2022 },
  extends: ["next/core-web-vitals"],
  rules: {
    // Keep a clean, strict baseline
    "@next/next/no-html-link-for-pages": "off"
  }
};

