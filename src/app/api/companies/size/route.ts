import { requireMember } from "@/application/auth";
import { executeCommand } from "@/application/commands";
import { repository } from "@/persistence/store";
import { errorResponse, jsonBody } from "@/foundation/http";
import { AppError } from "@/domain/validation";
import { fetchCompanySize } from "@/services/iberinform-service";

// Links a CRM company to its public Iberinform page and stores the free brackets. The page's NIF must match
// the company's NIF (names repeat; this is what prevents attaching another company's figures).
export async function POST(request: Request) {
  try {
    const me = await requireMember(request);
    const { id, url } = (await jsonBody(request)) as { id?: unknown; url?: unknown };
    if (typeof id !== "string" || typeof url !== "string") throw new AppError("Indica a empresa e o link do Iberinform.");
    const size = await fetchCompanySize(url);
    const result = await repository().transact((data) => {
      const company = data.organizations.find((item) => item.id === id);
      if (!company) throw new AppError("Empresa não encontrada.", 404);
      if (company.nif && size.nif && company.nif !== size.nif)
        throw new AppError(`Esta página é de outra empresa: NIF ${size.nif}, e esta empresa tem o NIF ${company.nif}.`);
      const { version, name, person, email, phone, stage, ownerId, nextStep, followUpOn } = company;
      executeCommand(data, me, { action: "organization.save", values: {
        id, version, name, person, email, phone, stage, ownerId, nextStep, followUpOn, size,
        ...(!company.nif && size.nif ? { nif: size.nif } : {}),
      } });
      return { message: `Dimensão atualizada a partir do Iberinform${!company.nif && size.nif ? ` (NIF ${size.nif} guardado)` : ""}.` };
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
