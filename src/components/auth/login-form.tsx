import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, XCircle } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { login } from "@/lib/auth-requests";
import { setEncodedCookieOneYear } from "@/lib/encryption";

const userStage = import.meta.env.VITE_APP_USER || "employee";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { saveAuth } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const isSubmitting = form.formState.isSubmitting;

  const onSubmit = async (values: LoginValues) => {
    setError("");
    try {
      const response: any = await login(values.username, values.password);

      if (
        String(response?.status) === "200" &&
        String(response?.data.status) === "200"
      ) {
        const data = response.data.data;
        setEncodedCookieOneYear("token", data.token);
        setEncodedCookieOneYear("chatuserId", data.chatuserId);
        saveAuth({ api_token: data.token });
        location.reload();
      } else {
        setError(response?.data?.message || "The login details are incorrect");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5.5">
      {/* Error box */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Username field */}
      <div>
        <label
          htmlFor="username"
          className="mb-2 block text-[13px] font-medium tracking-wide text-muted-foreground"
        >
          Username
        </label>
        <input
          id="username"
          type={userStage === "admin" ? "password" : "text"}
          placeholder="Enter your username"
          autoComplete="off"
          className="w-full rounded-xl border border-input bg-card/50 px-4 py-3.5 text-sm text-foreground outline-none transition-all duration-300 placeholder:text-muted-foreground/45 focus:border-primary focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-ring)_15%,transparent),0_0_24px_color-mix(in_srgb,var(--color-ring)_6%,transparent)] [backdrop-filter:blur(8px)]"
          {...form.register("username")}
        />
        {form.formState.errors.username && (
          <p className="mt-1.5 text-xs text-destructive">
            {form.formState.errors.username.message}
          </p>
        )}
      </div>

      {/* Password field */}
      <div>
        <label
          htmlFor="password"
          className="mb-2 block text-[13px] font-medium tracking-wide text-muted-foreground"
        >
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            autoComplete="off"
            className="w-full rounded-xl border border-input bg-card/50 px-4 py-3.5 pr-12 text-sm text-foreground outline-none transition-all duration-300 placeholder:text-muted-foreground/45 focus:border-primary focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-ring)_15%,transparent),0_0_24px_color-mix(in_srgb,var(--color-ring)_6%,transparent)] [backdrop-filter:blur(8px)]"
            {...form.register("password")}
          />
          <button
            type="button"
            className="absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center border-none bg-transparent p-1 text-muted-foreground transition-colors duration-200 hover:text-primary"
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
            aria-label="Toggle password visibility"
          >
            {showPassword ? (
              <EyeOff className="h-4.5 w-4.5" />
            ) : (
              <Eye className="h-4.5 w-4.5" />
            )}
          </button>
        </div>
        {form.formState.errors.password && (
          <p className="mt-1.5 text-xs text-destructive">
            {form.formState.errors.password.message}
          </p>
        )}
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="relative mt-2 w-full overflow-hidden rounded-xl border-none bg-[linear-gradient(135deg,var(--chat-gradient-from),var(--chat-gradient-to))] px-4 py-3.75 text-[15px] font-semibold tracking-wide text-white transition-all duration-300 hover:-translate-y-px hover:shadow-[0_8px_36px_color-mix(in_srgb,var(--color-primary)_45%,transparent)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:translate-y-0! font-['Outfit',sans-serif]"
      >
        {/* Hover shine overlay */}
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.15),transparent)] opacity-0 transition-opacity duration-300 hover:opacity-100 group-hover:opacity-100" />
        {isSubmitting ? (
          <span className="flex items-center justify-center">
            <Loader2 className="mr-2 h-4.5 w-4.5 animate-spin" />
            Please wait...
          </span>
        ) : (
          "Sign In"
        )}
      </button>
    </form>
  );
}
