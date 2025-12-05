import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'

export default defineConfig(
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
            '@typescript-eslint/no-explicit-any': 'off',
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
        },
    },
    prettierConfig,
)
