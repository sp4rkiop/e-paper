import next from "eslint-config-next";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...next,
  ...typescript,
  ...coreWebVitals,
  {
    ignores: [".next/**", "node_modules/**", "public/pdf.worker.min.mjs", "ui"],
  },
];

export default eslintConfig;
