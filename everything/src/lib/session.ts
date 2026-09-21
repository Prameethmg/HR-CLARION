export interface AppSession {
  id: string;
  role: string;
}

const SESSION_KEY = "hr-clarion-session";

export const getSession = (): AppSession | null => {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AppSession;
    if (parsed && typeof parsed.id === "string" && typeof parsed.role === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

export const saveSession = (session: AppSession): void => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const clearSession = (): void => {
  localStorage.removeItem(SESSION_KEY);
};

export const rolePath = (role: string): string => {
  switch (role) {
    case "MANAGER":
      return "/manager";
    case "HR":
      return "/hr";
    default:
      return "/employee";
  }
};
