import tseslint from "typescript-eslint";

const productLayerFiles = [
	"src/web/app/**/*.{ts,tsx}",
	"src/web/pages/**/*.{ts,tsx}",
	"src/web/widgets/**/*.{ts,tsx}",
	"src/web/features/**/*.{ts,tsx}",
	"src/web/entities/**/*.{ts,tsx}",
];

const rawUiElements = [
	"a",
	"button",
	"form",
	"input",
	"select",
	"table",
	"textarea",
];

export default tseslint.config(
	{
		ignores: ["dist/**", "node_modules/**", "worker-configuration.d.ts"],
	},
	{
		files: ["src/web/**/*.{ts,tsx}"],
		extends: [tseslint.configs.recommended],
	},
	{
		files: ["src/web/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: [
								"@heroui/react",
								"@heroui/react/*",
								"@heroui/styles",
								"@heroui/styles/*",
								"lucide-react",
							],
							message:
								"UI 라이브러리는 src/web/shared/ui의 adapter와 public API를 통해서만 사용하세요.",
						},
					],
				},
			],
		},
	},
	{
		files: ["src/web/shared/ui/adapters/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": "off",
		},
	},
	{
		files: productLayerFiles,
		rules: {
			"no-restricted-syntax": [
				"error",
				...rawUiElements.map((name) => ({
					selector: `JSXOpeningElement[name.name='${name}']`,
					message: `raw <${name}> 대신 src/web/shared/ui의 HeroUI 컴포넌트를 사용하세요.`,
				})),
				{
					selector: "JSXAttribute[name.name='style']",
					message:
						"인라인 스타일 대신 HeroUI 속성 또는 레이아웃용 Tailwind 유틸리티를 사용하세요.",
				},
			],
		},
	},
);
