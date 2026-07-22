export class AppError extends Error {
	constructor(
		public readonly status:
			| 400
			| 401
			| 403
			| 404
			| 409
			| 411
			| 413
			| 415
			| 500
			| 503,
		public readonly code: string,
		message: string,
		public readonly details?: unknown,
	) {
		super(message);
		this.name = "AppError";
	}
}
