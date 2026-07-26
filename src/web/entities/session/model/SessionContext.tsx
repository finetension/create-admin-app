import { createContext, type PropsWithChildren, useContext } from "react";
import type { CurrentUser } from "../../../../shared/contracts";

interface SessionValue {
	user: CurrentUser;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
	user,
	children,
}: PropsWithChildren<{ user: CurrentUser }>) {
	return (
		<SessionContext.Provider value={{ user }}>
			{children}
		</SessionContext.Provider>
	);
}

export function useSession(): SessionValue {
	const session = useContext(SessionContext);
	if (!session)
		throw new Error("useSession은 SessionProvider 안에서 사용해야 합니다.");
	return session;
}
