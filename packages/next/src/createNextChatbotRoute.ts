import {
  createChatbotHandler,
  type AuthAdapter,
  type ChatbotHandlerOptions,
  type ChatbotUser
} from "@rsainth/server";

export type NextChatbotRouteOptions<AppContext = unknown, AppUser = unknown> =
  ChatbotHandlerOptions<AppContext> & {
    auth?: AuthAdapter<AppContext>;
    appUser?: AppUser;
  };

export function createNextChatbotRoute<AppContext = unknown, AppUser = unknown>(
  options: NextChatbotRouteOptions<AppContext, AppUser>
) {
  const { auth, ...handlerOptions } = options;
  const handler = createChatbotHandler({
    ...handlerOptions,
    ...((handlerOptions.authAdapter ?? auth) ? { authAdapter: handlerOptions.authAdapter ?? auth } : {})
  });

  return async function POST(request: Request): Promise<Response> {
    return handler(request);
  };
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export function createHeaderAuthAdapter(
  resolveUser: (input: { request: Request; token: string | null }) => Promise<ChatbotUser | null>
): AuthAdapter {
  return {
    async authenticate({ request }) {
      const token = getBearerToken(request);
      const user = await resolveUser({ request, token });

      if (!user) {
        return null;
      }

      return user;
    }
  };
}
