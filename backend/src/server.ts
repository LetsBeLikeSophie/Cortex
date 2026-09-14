import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { itemsRoutes } from "./routes/items.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get("/health", async () => ({
  ok: true,
  anthropicConfigured: config.hasAnthropicKey,
  supabaseConfigured: config.hasSupabase,
}));

await app.register(itemsRoutes);

app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
