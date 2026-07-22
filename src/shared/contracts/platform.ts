export interface CurrentUser {
	id: string;
	email: string;
}

export interface ApiErrorBody {
	error: {
		code: string;
		message: string;
		details?: unknown;
	};
}
