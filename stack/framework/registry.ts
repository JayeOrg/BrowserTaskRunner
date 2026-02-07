import type { TaskConfig } from "./tasks.js";
import { botcLoginTask } from "../projects/botc/tasks/botc.js";

export const allTasks: TaskConfig[] = [botcLoginTask];
