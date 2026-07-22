import { defineCommand } from "citty";
import { seedLocalDatabase } from "../../local/seed.ts";

export default defineCommand({
	meta: {
		name: "seed",
		description: "사용자 설정으로 로컬 D1 예제 데이터를 생성합니다.",
	},
	args: {
		config: {
			type: "string",
			alias: "c",
			description:
				"배포 설정 파일. 생략하면 실제 파일 또는 example을 사용합니다.",
			valueHint: "path",
		},
	},
	async run({ args }) {
		await seedLocalDatabase(args.config);
	},
});
