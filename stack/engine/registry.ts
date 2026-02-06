import type { TaskConfig } from "./tasks.js";
import { botcLoginTask } from "../tasks/botc.js";

export const allTasks: TaskConfig[] = [botcLoginTask];
