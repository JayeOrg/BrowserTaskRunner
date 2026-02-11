import type { TaskConfig } from "./tasks.js";
import { botcLoginTask } from "../projects/botc/tasks/botc.js";
import { nandosOrderTask } from "../projects/nandos/tasks/nandos-order.js";

export const allTasks: TaskConfig[] = [botcLoginTask, nandosOrderTask];
