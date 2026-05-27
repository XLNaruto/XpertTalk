import {
  createContext,
  useContext,
  useState,
  useEffect,
  type Dispatch,
  type SetStateAction,
  type PropsWithChildren,
} from "react";
import { Loader2 } from "lucide-react";

// ── Models ──────────────────────────────────────────────────────────
export interface AuthModel {
  api_token: string;
  refreshToken?: string;
}

export interface UserModel {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  fullname?: string;
  pic?: string;
  occupation?: string;
  companyName?: string;
  phone?: string;
  roles?: number[];
}

// ── Local-storage helpers ───────────────────────────────────────────
const AUTH_LOCAL_STORAGE_KEY = "kt-auth-react-v";

function getAuth(): AuthModel | undefined {
  try {
    const raw = localStorage.getItem(AUTH_LOCAL_STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as AuthModel;
  } catch {
    console.error("AUTH LOCAL STORAGE PARSE ERROR");
    return undefined;
  }
}

function setAuth(auth: AuthModel) {
  try {
    localStorage.setItem(AUTH_LOCAL_STORAGE_KEY, JSON.stringify(auth));
  } catch {
    console.error("AUTH LOCAL STORAGE SAVE ERROR");
  }
}

function removeAuth() {
  try {
    localStorage.removeItem(AUTH_LOCAL_STORAGE_KEY);
  } catch {
    console.error("AUTH LOCAL STORAGE REMOVE ERROR");
  }
}

// ── Context ─────────────────────────────────────────────────────────
interface AuthContextProps {
  auth: AuthModel | undefined;
  saveAuth: (auth: AuthModel | undefined) => void;
  currentUser: UserModel | undefined;
  setCurrentUser: Dispatch<SetStateAction<UserModel | undefined>>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextProps>({
  auth: getAuth(),
  saveAuth: () => {},
  currentUser: undefined,
  setCurrentUser: () => {},
  logout: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

// ── Provider ────────────────────────────────────────────────────────
export function AuthProvider({ children }: PropsWithChildren) {
  const [auth, setAuthState] = useState<AuthModel | undefined>(getAuth);
  const [currentUser, setCurrentUser] = useState<UserModel | undefined>();

  const saveAuth = (a: AuthModel | undefined) => {
    setAuthState(a);
    if (a) setAuth(a);
    else removeAuth();
  };

  const logout = () => {
    saveAuth(undefined);
    setCurrentUser(undefined);
  };

  return (
    <AuthContext.Provider
      value={{ auth, saveAuth, currentUser, setCurrentUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Init (verify token on mount) ────────────────────────────────────
export function AuthInit({ children }: PropsWithChildren) {
  const { auth, logout } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // If auth token exists in localStorage, trust it.
    // Real validation happens server-side on every API/WS call.
    if (auth?.api_token) {
      setShowSplash(false);
    } else {
      logout();
      setShowSplash(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (showSplash) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
