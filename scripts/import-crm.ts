import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { LocalWorkspaceRepository } from "../src/persistence/store";
import {
  importLegacyCrm,
  type LegacyExport,
} from "../src/migrations/legacy-crm";
const file = process.argv[2];
if (!file) throw new Error("Indica o export JSON validado.");
const input = JSON.parse(await readFile(file, "utf8")) as LegacyExport;
const directory = path.resolve(process.env.VOUGA_DATA_DIR || ".local");
const repo = new LocalWorkspaceRepository(directory, () => {
  throw new Error("Workspace existente obrigatório.");
});
const memberMap: Record<string, string> = {};
for (const member of input.tables.members) {
  const name = String(member.display_name).toLowerCase();
  if (name === "ines") memberMap[String(member.id)] = "miguel";
  if (["miguel", "roque", "ana", "pedro", "vasco"].includes(name))
    memberMap[String(member.id)] = name === "roque" ? "afonso" : name;
}
const options = { actorId: "miguel", memberMap };
const initial = await repo.read();
const plan = importLegacyCrm(initial, input, options);
console.log(JSON.stringify(plan.report, null, 2));
if (process.argv.includes("--apply")) {
  if (plan.report.review.length)
    throw new Error("Resolver os registos em revisão antes de aplicar.");
  const backupDirectory = path.join(directory, "backups");
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  await writeFile(
    path.join(backupDirectory, `before-crm-${Date.now()}.json`),
    JSON.stringify(initial, null, 2),
    { mode: 0o600, flag: "wx" },
  );
  await repo.transact((store) => {
    if (store.revision !== initial.revision)
      throw new Error("Workspace alterado. Repetir a pré-visualização.");
    Object.assign(store, plan.data);
  });
  console.log("Importação local concluída. Supabase não foi alterado.");
}
