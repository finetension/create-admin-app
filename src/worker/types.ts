import type { CurrentUser } from "../shared/contracts";

export type AppEnv = {
	Bindings: Cloudflare.Env;
	Variables: {
		user: CurrentUser;
	};
};

export interface UserRow {
	id: string;
	email: string;
}
