// The console's base (typescript-eslint recommendedTypeChecked, @stylistic with double quotes, no
// semicolons and 2-space indent), plus one SDK rule: the core never reads DOM text or values.
import js from "@eslint/js"
import stylistic from "@stylistic/eslint-plugin"
import { defineConfig, globalIgnores } from "eslint/config"
import tseslint from "typescript-eslint"

export default defineConfig(
  globalIgnores(["**/dist", "**/node_modules", "fixtures/react-app/dist", "examples/tunnel/go", "playwright-report", "test-results", ".packs",
    "packages/rum-build/test/vectors"]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  stylistic.configs.customize({ quotes: "double", semi: false, indent: 2 }),
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["packages/rum/src/**"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "MemberExpression[property.name=/^(innerText|textContent|innerHTML|value)$/]",
        message: "The SDK never reads DOM text or input values (spec: Privacy).",
      }],
    },
  },
)
