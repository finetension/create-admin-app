import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
	type AccessInspection,
	inspectAccess,
	resolveAccessApiToken,
} from "../cloudflare/access.ts";
import {
	type CloudflareIdentity,
	inspectCloudflareIdentity,
	resolveAccountId,
} from "../cloudflare/account.ts";
import { resolveWorkersDevSubdomain } from "../cloudflare/workers.ts";
import { inspectZone, type ZoneResource } from "../cloudflare/zone.ts";
import {
	createDeploymentConfig,
	type DeploymentConfig,
	loadUserConfig,
	readCompatibilityDate,
} from "../core/config.ts";
import { resolveCloudflareApiToken } from "../core/credentials.ts";
import { logger } from "../core/logger.ts";
import { projectRoot, resolveProjectPath } from "../core/paths.ts";
import {
	type CommandResult,
	type RunOptions,
	runCommand,
	runWrangler,
} from "../core/process.ts";
import { parsePort } from "./dev.ts";

const DEFAULT_DEV_PORT = 10_050;

export type DoctorStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
	id: string;
	label: string;
	status: DoctorStatus;
	message: string;
}

export interface DoctorReport {
	checks: DoctorCheck[];
}

interface PortListener {
	pid: number;
	command: string;
	cwd?: string;
}

export interface PortInspection {
	port: number;
	listeners: PortListener[];
	registryAvailable: boolean;
	registeredForProject: boolean;
	registryConflicts: string[];
}

export interface DoctorOptions {
	configPath?: string;
	port?: string;
}

export interface DoctorDependencies {
	env: NodeJS.ProcessEnv;
	nodeVersion: string;
	loadConfig: typeof loadUserConfig;
	readCompatibilityDate: typeof readCompatibilityDate;
	inspectIdentity: typeof inspectCloudflareIdentity;
	resolveAccountId: typeof resolveAccountId;
	inspectAccess: typeof inspectAccess;
	inspectZone: typeof inspectZone;
	resolveWorkersDevSubdomain: typeof resolveWorkersDevSubdomain;
	inspectPort: (port: number) => Promise<PortInspection>;
	runCommand: (
		command: string,
		args: string[],
		options?: RunOptions,
	) => Promise<CommandResult>;
	runWrangler: typeof runWrangler;
}

function sanitizeError(error: unknown): string {
	return (error instanceof Error ? error.message : String(error))
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 240);
}

function check(
	id: string,
	label: string,
	status: DoctorStatus,
	message: string,
): DoctorCheck {
	return { id, label, status, message };
}

function parseVersion(value: string): [number, number, number] | null {
	const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
	return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function isSupportedNode(version: [number, number, number]): boolean {
	const [major, minor] = version;
	return major > 22 || (major === 22 && minor >= 13);
}

function versionCheck(
	id: string,
	label: string,
	value: string,
	isSupported: (version: [number, number, number]) => boolean,
	requirement: string,
): DoctorCheck {
	const version = parseVersion(value);
	return version && isSupported(version)
		? check(id, label, "pass", value.trim().replace(/^v/, ""))
		: check(id, label, "fail", `${value.trim() || "unknown"} · ${requirement}`);
}

function parseLsofListeners(output: string): Array<Omit<PortListener, "cwd">> {
	const listeners: Array<Omit<PortListener, "cwd">> = [];
	let current: Omit<PortListener, "cwd"> | undefined;
	for (const line of output.split("\n")) {
		if (line.startsWith("p")) {
			if (current) listeners.push(current);
			current = { pid: Number(line.slice(1)), command: "unknown" };
		} else if (line.startsWith("c") && current) {
			current.command = line.slice(1);
		}
	}
	if (current) listeners.push(current);
	return listeners.filter((listener) => Number.isInteger(listener.pid));
}

function isWithinProject(path: string, root: string): boolean {
	return path === root || path.startsWith(`${root}/`);
}

function expandHome(path: string): string {
	return path === "~" || path.startsWith("~/")
		? resolve(homedir(), path.slice(2))
		: resolve(path);
}

export async function inspectDevelopmentPort(
	port: number,
): Promise<PortInspection> {
	const processResult = await runCommand(
		"lsof",
		["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"],
		{ capture: true, allowFailure: true },
	);
	const listeners = await Promise.all(
		parseLsofListeners(processResult.stdout).map(async (listener) => {
			const cwdResult = await runCommand(
				"lsof",
				["-a", "-p", String(listener.pid), "-d", "cwd", "-Fn"],
				{ capture: true, allowFailure: true },
			);
			const cwd = cwdResult.stdout
				.split("\n")
				.find((line) => line.startsWith("n"))
				?.slice(1);
			return { ...listener, cwd };
		}),
	);

	const registryPath = resolve(homedir(), ".ports");
	if (!existsSync(registryPath)) {
		return {
			port,
			listeners,
			registryAvailable: false,
			registeredForProject: false,
			registryConflicts: [],
		};
	}
	const entries = readFileSync(registryPath, "utf8")
		.split("\n")
		.filter((line) => line.trim() && !line.trimStart().startsWith("#"))
		.map((line) => line.split(","))
		.filter((fields) => fields.length >= 5)
		.map(([tag = "unknown", , value = "", project = ""]) => ({
			tag,
			port: value === "?" ? undefined : Number(value),
			project: expandHome(project),
		}));
	const projectEntries = entries.filter((entry) =>
		isWithinProject(projectRoot, entry.project),
	);
	const conflicts = entries
		.filter(
			(entry) =>
				entry.port === port && !isWithinProject(projectRoot, entry.project),
		)
		.map((entry) => `${entry.tag} (${entry.project})`);

	return {
		port,
		listeners,
		registryAvailable: true,
		registeredForProject: projectEntries.some((entry) => entry.port === port),
		registryConflicts: conflicts,
	};
}

function portCheck(inspection: PortInspection): DoctorCheck {
	const foreignListeners = inspection.listeners.filter(
		(listener) => !listener.cwd || !isWithinProject(listener.cwd, projectRoot),
	);
	if (foreignListeners.length > 0) {
		const listener = foreignListeners[0];
		return check(
			"port",
			"Local port",
			"fail",
			`${inspection.port} is used by ${listener?.command ?? "another process"}${listener?.pid ? ` (PID ${listener.pid})` : ""}`,
		);
	}
	const details: string[] = [];
	if (inspection.listeners.length > 0) details.push("running in this project");
	else details.push("available");
	if (inspection.registryConflicts.length > 0) {
		details.push(`registered by ${inspection.registryConflicts.join(", ")}`);
	}
	if (inspection.registryAvailable && !inspection.registeredForProject) {
		details.push("this project is not registered in ~/.ports");
	}
	const status =
		inspection.registryConflicts.length > 0 ||
		(inspection.registryAvailable && !inspection.registeredForProject)
			? "warn"
			: "pass";
	return check(
		"port",
		"Local port",
		status,
		`${inspection.port} · ${details.join(" · ")}`,
	);
}

function skipped(id: string, label: string, reason: string): DoctorCheck {
	return check(id, label, "warn", `not checked · ${reason}`);
}

async function commandVersionCheck(
	id: string,
	label: string,
	run: () => Promise<CommandResult>,
	isSupported: (version: [number, number, number]) => boolean,
	requirement: string,
): Promise<DoctorCheck> {
	try {
		const result = await run();
		if (result.exitCode !== 0) {
			return check(id, label, "fail", sanitizeError(result.stderr));
		}
		return versionCheck(id, label, result.stdout, isSupported, requirement);
	} catch (error) {
		return check(id, label, "fail", sanitizeError(error));
	}
}

async function wranglerPermissionCheck(
	id: string,
	label: string,
	args: string[],
	accountId: string,
	dependencies: DoctorDependencies,
	missingResourceIsSuccess = false,
): Promise<DoctorCheck> {
	const result = await dependencies.runWrangler(args, {
		accountId,
		capture: true,
		allowFailure: true,
	});
	if (
		result.exitCode === 0 ||
		(missingResourceIsSuccess && result.stderr.includes("[code: 10007]"))
	) {
		return check(id, label, "pass", "read access verified");
	}
	return check(id, label, "fail", sanitizeError(result.stderr));
}

const defaultDependencies: DoctorDependencies = {
	env: process.env,
	nodeVersion: process.versions.node,
	loadConfig: loadUserConfig,
	readCompatibilityDate,
	inspectIdentity: inspectCloudflareIdentity,
	resolveAccountId,
	inspectAccess,
	inspectZone,
	resolveWorkersDevSubdomain,
	inspectPort: inspectDevelopmentPort,
	runCommand,
	runWrangler,
};

export async function runDoctor(
	options: DoctorOptions = {},
	overrides: Partial<DoctorDependencies> = {},
): Promise<DoctorReport> {
	const dependencies = { ...defaultDependencies, ...overrides };
	const checks: DoctorCheck[] = [];
	const configPath = resolveProjectPath(
		options.configPath ?? "./deploy.config.json",
	);
	const port = parsePort(options.port) ?? DEFAULT_DEV_PORT;

	checks.push(
		versionCheck(
			"node",
			"Node.js",
			dependencies.nodeVersion,
			isSupportedNode,
			">=22.13.0 required",
		),
	);
	const [pnpmCheck, wranglerCheck, configResult, identityResult, portResult] =
		await Promise.all([
			commandVersionCheck(
				"pnpm",
				"pnpm",
				() =>
					dependencies.runCommand("pnpm", ["--version"], {
						capture: true,
						allowFailure: true,
					}),
				([major]) => major === 11,
				"11.x required",
			),
			commandVersionCheck(
				"wrangler",
				"Wrangler",
				() =>
					dependencies.runWrangler(["--version"], {
						capture: true,
						allowFailure: true,
					}),
				([major]) => major >= 4,
				"4.x or newer required",
			),
			Promise.all([
				dependencies.loadConfig(configPath),
				dependencies.readCompatibilityDate(),
			])
				.then(([userConfig, compatibilityDate]) => ({
					userConfig,
					compatibilityDate,
				}))
				.catch((error: unknown) => ({ error })),
			dependencies
				.inspectIdentity()
				.then((identity) => ({ identity }))
				.catch((error: unknown) => ({ error })),
			dependencies
				.inspectPort(port)
				.then((inspection) => ({ inspection }))
				.catch((error: unknown) => ({ error })),
		]);
	checks.push(pnpmCheck, wranglerCheck);

	let userConfig: Awaited<ReturnType<typeof loadUserConfig>> | undefined;
	let compatibilityDate: string | undefined;
	if ("error" in configResult) {
		checks.push(
			check("config", "Config", "fail", sanitizeError(configResult.error)),
		);
	} else {
		userConfig = configResult.userConfig;
		compatibilityDate = configResult.compatibilityDate;
		checks.push(
			check(
				"config",
				"Config",
				"pass",
				`${userConfig.serviceName} · ${userConfig.hostname ?? "workers.dev"}`,
			),
		);
	}

	let identity: CloudflareIdentity | undefined;
	let accountId: string | undefined;
	if ("error" in identityResult) {
		checks.push(
			check(
				"account",
				"Cloudflare",
				"fail",
				sanitizeError(identityResult.error),
			),
		);
	} else {
		identity = identityResult.identity;
		try {
			accountId = await dependencies.resolveAccountId(
				identity,
				dependencies.env.CLOUDFLARE_ACCOUNT_ID?.trim(),
			);
			checks.push(
				check(
					"account",
					"Cloudflare",
					"pass",
					`${identity.authType ?? "authenticated"} · account selected`,
				),
			);
		} catch (error) {
			checks.push(check("account", "Cloudflare", "fail", sanitizeError(error)));
		}
	}

	let workersDevSubdomain: string | undefined;
	let workersDevRoutingCheck: DoctorCheck | undefined;
	if (userConfig?.routing === "workers-dev" && accountId) {
		const token = resolveCloudflareApiToken(dependencies.env);
		if (!token) {
			workersDevRoutingCheck = check(
				"zone",
				"Workers route",
				"fail",
				"CLOUDFLARE_API_TOKEN required to resolve workers.dev",
			);
		} else {
			try {
				workersDevSubdomain = await dependencies.resolveWorkersDevSubdomain(
					accountId,
					token,
				);
				workersDevRoutingCheck = check(
					"zone",
					"Workers route",
					"pass",
					`${workersDevSubdomain}.workers.dev`,
				);
			} catch (error) {
				workersDevRoutingCheck = check(
					"zone",
					"Workers route",
					"fail",
					sanitizeError(error),
				);
			}
		}
	}
	const deploymentConfig =
		userConfig &&
		compatibilityDate &&
		accountId &&
		(userConfig.routing === "custom-domain" || workersDevSubdomain)
			? createDeploymentConfig(
					userConfig,
					accountId,
					compatibilityDate,
					workersDevSubdomain,
				)
			: undefined;
	if (accountId) {
		const [worker, d1] = await Promise.all([
			deploymentConfig
				? wranglerPermissionCheck(
						"workers",
						"Workers API",
						[
							"deployments",
							"list",
							"--name",
							deploymentConfig.workerName,
							"--json",
						],
						accountId,
						dependencies,
						true,
					)
				: Promise.resolve(
						skipped("workers", "Workers API", "config unavailable"),
					),
			wranglerPermissionCheck(
				"d1",
				"D1 API",
				["d1", "list", "--json"],
				accountId,
				dependencies,
			),
		]);
		checks.push(worker, d1);
	} else {
		checks.push(
			skipped("workers", "Workers API", "account unavailable"),
			skipped("d1", "D1 API", "account unavailable"),
		);
	}

	if (userConfig?.routing === "workers-dev") {
		checks.push(
			workersDevRoutingCheck ??
				skipped("zone", "Workers route", "config or account unavailable"),
		);
	} else if (deploymentConfig?.domain) {
		const token = resolveCloudflareApiToken(dependencies.env);
		if (token) {
			try {
				const zone = await dependencies.inspectZone(
					deploymentConfig.domain,
					deploymentConfig.accountId,
					token,
				);
				checks.push(zoneCheck(zone, deploymentConfig));
			} catch (error) {
				checks.push(check("zone", "Domain zone", "fail", sanitizeError(error)));
			}
		} else if (
			identity?.tokenPermissions.includes("zone:read") &&
			identity.tokenPermissions.includes("workers_routes:write")
		) {
			checks.push(
				check(
					"zone",
					"Domain zone",
					"warn",
					"OAuth scopes present · exact zone check requires CLOUDFLARE_API_TOKEN",
				),
			);
		} else {
			checks.push(
				check(
					"zone",
					"Domain zone",
					"fail",
					"Zone Read and Workers Routes Write access required",
				),
			);
		}
	} else {
		checks.push(
			skipped("zone", "Domain zone", "config or account unavailable"),
		);
	}

	let access: AccessInspection | undefined;
	const accessToken = resolveAccessApiToken(dependencies.env);
	if (!accessToken) {
		checks.push(
			check(
				"access",
				"Access API",
				"fail",
				"CLOUDFLARE_ACCESS_API_TOKEN or CLOUDFLARE_API_TOKEN required",
			),
		);
	} else if (!deploymentConfig) {
		checks.push(
			skipped("access", "Access API", "config or account unavailable"),
		);
	} else {
		try {
			access = await dependencies.inspectAccess(deploymentConfig, accessToken);
			checks.push(
				access.available
					? check("access", "Access API", "pass", "read access verified")
					: check("access", "Access API", "fail", "token was not detected"),
			);
		} catch (error) {
			checks.push(check("access", "Access API", "fail", sanitizeError(error)));
		}
	}

	if (access?.identityProvider) {
		checks.push(
			check("identity", "Access login", "pass", "One-time PIN IdP found"),
		);
	} else if (access?.available) {
		checks.push(
			check("identity", "Access login", "pass", "One-time PIN will be created"),
		);
	} else {
		checks.push(
			check(
				"identity",
				"Access login",
				"warn",
				"not verified · One-time PIN will be created during deploy",
			),
		);
	}

	checks.push(
		"error" in portResult
			? check("port", "Local port", "warn", sanitizeError(portResult.error))
			: portCheck(portResult.inspection),
	);

	return { checks };
}

function zoneCheck(
	zone: ZoneResource | null,
	config: DeploymentConfig,
): DoctorCheck {
	if (!zone) {
		return check(
			"zone",
			"Domain zone",
			"fail",
			`${config.domain ?? "configured domain"} was not found in the selected account`,
		);
	}
	return zone.status === "active"
		? check("zone", "Domain zone", "pass", `${zone.name} · active`)
		: check("zone", "Domain zone", "fail", `${zone.name} · ${zone.status}`);
}

export function formatDoctorReport(report: DoctorReport): string {
	const marker: Record<DoctorStatus, string> = {
		pass: "✓ PASS",
		warn: "! WARN",
		fail: "✗ FAIL",
	};
	const lines = report.checks.map(
		(item) =>
			`${marker[item.status]}  ${item.label.padEnd(14)} ${item.message}`,
	);
	const counts = { pass: 0, warn: 0, fail: 0 };
	for (const item of report.checks) counts[item.status] += 1;
	return [
		...lines,
		"",
		`Result: ${counts.pass} passed · ${counts.warn} warnings · ${counts.fail} failed`,
	].join("\n");
}

export function doctorHasIssues(report: DoctorReport, strict = false): boolean {
	return report.checks.some(
		(item) => item.status === "fail" || (strict && item.status === "warn"),
	);
}

export function printDoctorReport(report: DoctorReport): void {
	logger.box({ title: "Platform doctor", message: formatDoctorReport(report) });
}
