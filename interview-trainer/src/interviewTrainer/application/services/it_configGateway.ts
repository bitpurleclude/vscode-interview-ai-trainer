// Application-level gateway for config-related infra dependencies.

export {
  it_ensureConfigFiles,
  it_getUserProviderDir,
} from "../../infra/api/it_apiConfig";
export type {
  ItApiConfig,
  ItConfigBundle,
  ItGuardrailsConfig,
  ItTemplatesConfig,
} from "../../infra/api/it_apiConfig";
export { ItConfigService } from "../../infra/api/it_configService";
