export interface CreateOptions {
	directory?: string;
	name?: string;
	emails?: string;
	public: boolean;
	skipInstall: boolean;
	deploy: boolean;
	message?: string;
	yes: boolean;
	json: boolean;
	interactive: boolean;
}

export interface CreateContext {
	args: CreateOptions;
	machine: boolean;
	project: {
		directoryInput: string;
		destination: string;
		staging: string;
		packageName: string;
		displayName: string;
		allowedEmails: string[];
	};
	deploymentResult?: unknown;
}

export type CreatePhase = (context: CreateContext) => Promise<void>;

export interface CreatePhases {
	scaffold: CreatePhase;
	configure: CreatePhase;
	finalize: CreatePhase;
}
