import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function configured() {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_PUBLISHABLE_KEY;
}
export async function supabase() {
  const jar = await cookies();
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: (process.env.APP_ORIGIN ?? "").startsWith("https://"),
      },
      cookies: {
        getAll: () => jar.getAll(),
        setAll(values) {
          try {
            values.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Server component: proxy handles refresh. */
          }
        },
      },
    },
  );
}
