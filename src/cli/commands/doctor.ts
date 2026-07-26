import { defineCommand } from "citty";
import {
	cliRuntime,
	commonOutputArgs,
	writeCliResult,
} from "../core/runtime.ts";
import {
	doctorHasIssues,
	printDoctorReport,
	runDoctor,
} from "../project/doctor.ts";

export default defineCommand({
	meta: {
		name: "doctor",
		description: "프로젝트와 배포 준비 상태를 변경 없이 진단합니다.",
	},
	args: {
		...commonOutputArgs,
		strict: {
			type: "boolean",
			description: "warning도 실패 종료로 처리합니다.",
			default: false,
		},
	},
	async run({ args }) {
		const report = await runDoctor();
		if (cliRuntime().machine) writeCliResult(report);
		else printDoctorReport(report);
		if (doctorHasIssues(report, args.strict)) process.exitCode = 3;
	},
});
