import profile from "../profile.md";
import { createHandler, type Env } from "./app";

export { Limiter } from "./limiter";

const handle = createHandler(profile);

export default {
  fetch: (req, env) => handle(req, env),
} satisfies ExportedHandler<Env>;
