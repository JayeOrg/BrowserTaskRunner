import { defineProject } from "../../framework/project.js";
import { nandosSecretsSchema } from "../utils/schemas.js";
import { run } from "./tasks/nandosOrder.steps.js";

export const project = defineProject({
  name: "nandos",
  tasks: [
    {
      name: "nandosOrder",
      displayUrl: "https://www.nandos.com.au/sign-in",
      mode: "once",
      keepBrowserOpen: true,
      secretsSchema: nandosSecretsSchema,
      run,
    },
  ],
});
