import { ZaiInvestigatorProvider } from "../../adapters/ai/zai-investigator-provider";
import { InvestigatorService } from "./investigator-service";

function requireServerEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MISSING_ENV:${name}`);
  return value;
}

export function createInvestigatorService(): InvestigatorService {
  return new InvestigatorService({
    databaseUrl: requireServerEnvironment("DATABASE_URL"),
    provider: new ZaiInvestigatorProvider({
      apiKey: requireServerEnvironment("ZAI_API_KEY"),
      model: requireServerEnvironment("ZAI_MODEL"),
      baseUrl: requireServerEnvironment("ZAI_BASE_URL"),
    }),
  });
}
