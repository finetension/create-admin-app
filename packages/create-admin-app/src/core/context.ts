export interface CreateOptions {
	directory?: string;
	name?: string;
	emails?: string;
	domain?: string;
	subdomain?: string;
	yes: boolean;
	skipInstall: boolean;
	github?: boolean;
	cloudflare?: boolean;
	public: boolean;
	deploy: boolean;
	help: boolean;
}

export interface CloudflareSetup {
	accountId: string;
	accountName: string;
	token: string;
	domain?: string;
	subdomain?: string;
}

export interface CreateContext {
	args: CreateOptions;
	interactive: boolean;
	project: {
		directoryInput: string;
		destination: string;
		packageName: string;
		displayName: string;
		allowedEmails: string;
	};
	cloudflare?: CloudflareSetup;
	repository?: string;
}

export type CreatePhase = (context: CreateContext) => Promise<void>;

export interface CreatePhases {
	scaffold: CreatePhase;
	configure: CreatePhase;
	connect: CreatePhase;
	finalize: CreatePhase;
}
