import { readFileSync, writeFileSync } from "node:fs";
const source = readFileSync(
  new URL(
    "../docs/Vouga_Sales_Knowledge_Academy_Case_Library.md",
    import.meta.url,
  ),
  "utf8",
);
const lines = source.split("\n");
const headings: { line: number; level: number; title: string }[] = [];
let fenced = false;
for (let line = 0; line < lines.length; line++) {
  if (/^```/.test(lines[line])) {
    fenced = !fenced;
    continue;
  }
  if (fenced) continue;
  const match = /^(#{1,2}) (.+)$/.exec(lines[line]);
  if (match) headings.push({ line, level: match[1].length, title: match[2] });
}
const clean = (text: string) => text.replace(/ — /g, ": ").replace(/–/g, " a ");
const anchor = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
const entries = headings.flatMap((heading, i) => {
  let area: "academy" | "cases";
  if (/^CL-|^Como utilizar e atualizar/.test(heading.title)) area = "cases";
  else if (/^Módulo |^Anexo |^Como usar|^Nota final/.test(heading.title))
    area = "academy";
  else return [];
  const end =
    headings.slice(i + 1).find((h) => h.level <= heading.level)?.line ??
    lines.length;
  let content = lines
    .slice(heading.line + 1, end)
    .join("\n")
    .trim()
    .replace(/\n---\s*$/, "");
  if (heading.title === "Como usar este documento")
    content = content.replace(/### Índice[\s\S]*?(?=### Como avaliar)/, "");
  const code = /^(Módulo \d+|CL-\d+|Anexo [A-D])/.exec(heading.title)?.[1];
  return [
    {
      id: anchor(heading.title),
      area,
      title: clean(
        heading.title.replace(/^(Módulo \d+|CL-\d+|Anexo [A-D]) — /, ""),
      ),
      code: code ?? "Guia",
      content: clean(content),
      kind: /^CL-/.test(heading.title)
        ? content.includes("[EXEMPLO FICTÍCIO]")
          ? "Exemplo fictício"
          : "Contexto interno · Hipóteses"
        : undefined,
    },
  ];
});
if (
  entries.filter((e) => e.code.startsWith("Módulo")).length !== 8 ||
  entries.filter((e) => e.code.startsWith("CL-")).length !== 12
)
  throw new Error(
    "Expected 8 modules and 12 cases. Review the document headings.",
  );
writeFileSync(
  new URL("../src/content/sales-knowledge.json", import.meta.url),
  JSON.stringify(entries, null, 2) + "\n",
);
console.log(
  `Generated ${entries.length} reading sections from the source document.`,
);
