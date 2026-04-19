import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const ruleOverrides = {
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/ban-ts-comment": "off",
  "@typescript-eslint/no-empty-object-type": "off",
  "@typescript-eslint/no-require-imports": "off",
  "react-hooks/set-state-in-effect": "off",
  "react-hooks/purity": "off",
  "react-hooks/preserve-manual-memoization": "off",
  "react-hooks/immutability": "off",
  "@next/next/no-img-element": "off",
  "@next/next/no-html-link-for-pages": "off",
  "react/no-unescaped-entities": "off",
  "react-refresh/only-export-components": "off",
  "import/no-anonymous-default-export": "off"
};

const patchedNextConfigs = nextCoreWebVitals.map((config) => {
  if (config && config.rules) {
    return {
      ...config,
      rules: {
        ...config.rules,
        ...ruleOverrides
      }
    };
  }
  return config;
});

export default [
  {
    ignores: [".next/**", "node_modules/**", "dist/**", "coverage/**"]
  },
  ...patchedNextConfigs
];
