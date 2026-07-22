import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { AppError } from "./lib/errors";
import { authenticate } from "./middleware/auth";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", secureHeaders());
app.use("*", logger());

app.get("/health", (c) =>
	c.json({
		status: "ok",
		environment: c.env.ENVIRONMENT,
		timestamp: new Date().toISOString(),
	}),
);

app.use("*", authenticate);
app.get("/me", (c) => c.json({ data: c.get("user") }));

app.notFound((c) =>
	c.json(
		{ error: { code: "NOT_FOUND", message: "API 경로를 찾을 수 없습니다." } },
		404,
	),
);

app.onError((error, c) => {
	if (error instanceof AppError) {
		return c.json(
			{
				error: {
					code: error.code,
					message: error.message,
					...(error.details === undefined ? {} : { details: error.details }),
				},
			},
			error.status,
		);
	}

	console.error(
		JSON.stringify({
			level: "error",
			message: "Unhandled API error",
			error: error instanceof Error ? error.message : String(error),
			path: c.req.path,
		}),
	);
	return c.json(
		{
			error: { code: "INTERNAL_ERROR", message: "요청을 처리하지 못했습니다." },
		},
		500,
	);
});

export default app;
