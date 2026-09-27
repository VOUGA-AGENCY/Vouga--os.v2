import { copyFileSync, existsSync, constants } from "node:fs";
if (!existsSync(".env.local")) copyFileSync(".env.example", ".env.local", constants.COPYFILE_EXCL);
console.log("Configuração local pronta. Executa bun run dev e abre http://127.0.0.1:3100.");
