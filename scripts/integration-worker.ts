import { runtime } from "../src/services/runtime";
import { runIntegrationTick } from "../src/services/integration-worker";
let running = true;
process.on("SIGINT", () => { running = false; });
process.on("SIGTERM", () => { running = false; });
console.log("Vouga integration worker · local · stops when this computer sleeps");
while (running) {
  try { await runIntegrationTick(runtime()); } catch { console.error("Integration tick failed; inspect integration status."); }
  if (running) await new Promise((resolve) => setTimeout(resolve, 60000));
}
