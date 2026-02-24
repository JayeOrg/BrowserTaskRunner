import { defineProject } from "../../framework/project.js";
import { loginSecretsSchema } from "../utils/schemas.js";
import {
  navigate,
  fillLogin,
  turnstileBeforeSubmit,
  submit,
  checkResult,
} from "./tasks/botcLogin.steps.js";

export const project = defineProject({
  name: "monitor-botc",
  tasks: [
    {
      name: "botcLogin",
      displayUrl: "https://botc.app/",
      mode: "retry",
      intervalMs: 300_000,
      secretsSchema: loginSecretsSchema,
      steps: [navigate, fillLogin, turnstileBeforeSubmit, submit, checkResult],
    },
  ],
});
