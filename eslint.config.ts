import eslint from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'
import vitest from '@vitest/eslint-plugin'

export default defineConfig(
    globalIgnores(['dist', 'coverage']),
    eslint.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
            },
        },
        rules: {
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-confusing-void-expression': [
                'error',
                {
                    ignoreArrowShorthand: true,
                    ignoreVoidOperator: true,
                    ignoreVoidReturningFunctions: true,
                },
            ],
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    caughtErrors: 'none',
                },
            ],
            '@typescript-eslint/no-unsafe-member-access': [
                'error',
                {
                    allowOptionalChaining: true,
                },
            ],
            '@typescript-eslint/no-unnecessary-condition': [
                'error',
                {
                    allowConstantLoopConditions: 'only-allowed-literals',
                },
            ],
        },
    },
    {
        files: ['vite.config.ts', 'prettier.config.ts', 'eslint.config.ts'],
        rules: {
            '@typescript-eslint/no-unsafe-call': 'off',
        },
    },
    {
        files: ['test/**'],
        plugins: {
            vitest,
        },
        rules: {
            ...vitest.configs.all.rules,
            'vitest/no-hooks': 'off',
            'vitest/prefer-expect-assertions': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-confusing-void-expression': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-invalid-void-type': 'off',
            '@typescript-eslint/unbound-method': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
        },
        settings: {
            vitest: {
                typecheck: true,
            },
        },
    },
    {
        files: ['examples/**'],
        rules: {
            '@typescript-eslint/no-non-null-assertion': 'off',
        },
    },
    prettierConfig,
)
