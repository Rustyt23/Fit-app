// OpenNext config for Cloudflare. Every page is dynamic (personal data), so no
// incremental cache (R2 bucket) is needed.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
