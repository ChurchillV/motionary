// Import this first in every script: loads .env.local then .env before lib/config.ts reads them.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
