import { Component, type ErrorInfo, type ReactNode } from "react";
import { FatalErrorPage } from "./ErrorPages";

interface AppErrorBoundaryState {
	failed: boolean;
}

export class AppErrorBoundary extends Component<
	{ children: ReactNode },
	AppErrorBoundaryState
> {
	state: AppErrorBoundaryState = { failed: false };

	static getDerivedStateFromError(): AppErrorBoundaryState {
		return { failed: true };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("Unhandled web render error", error, info);
	}

	render() {
		if (this.state.failed) {
			return <FatalErrorPage onRetry={() => globalThis.location.reload()} />;
		}
		return this.props.children;
	}
}
