import { createInterface } from "node:readline";
import { Writable } from "node:stream";

function promptHidden(label: string): Promise<string> {
  const muted = new Writable({
    write(_data, _enc, cb) {
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
  process.stderr.write(`${label}: `);
  return new Promise((done) => {
    rl.question("", (line) => {
      rl.close();
      process.stderr.write("\n");
      done(line);
    });
  });
}

// Buffer all piped stdin lines on first read so multiple readStdinLine calls work
let stdinBuffer: Promise<string[]> | null = null;
let stdinIndex = 0;

function bufferStdin(): Promise<string[]> {
  return new Promise((done) => {
    const lines: string[] = [];
    const rl = createInterface({ input: process.stdin });
    rl.on("line", (line) => {
      lines.push(line);
    });
    rl.on("close", () => {
      done(lines);
    });
  });
}

async function readStdinLine(errorMessage: string): Promise<string> {
  if (stdinBuffer === null) {
    stdinBuffer = bufferStdin();
  }
  const lines = await stdinBuffer;
  const result = lines[stdinIndex];
  if (result === undefined) {
    throw new Error(errorMessage);
  }
  stdinIndex += 1;
  return result;
}

async function getPassword(): Promise<string> {
  if (process.stdin.isTTY) {
    return promptHidden("Vault password");
  }
  return readStdinLine("No password provided on stdin");
}

async function getSecretValue(): Promise<string> {
  if (process.stdin.isTTY) {
    return promptHidden("Value");
  }
  return readStdinLine("No value provided on stdin");
}

function promptConfirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) return Promise.resolve(true);
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((done) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      done(answer.trim().toLowerCase() === "y");
    });
  });
}

async function getNewPassword(): Promise<string> {
  if (process.stdin.isTTY) {
    const password = await promptHidden("New vault password");
    const confirm = await promptHidden("Confirm new password");
    if (password !== confirm) {
      throw new Error("Passwords do not match");
    }
    return password;
  }
  const password = await readStdinLine("No password provided on stdin");
  const confirm = await readStdinLine("No confirmation password provided on stdin");
  if (password !== confirm) {
    throw new Error("Passwords do not match");
  }
  return password;
}

export { promptHidden, readStdinLine, getPassword, getNewPassword, getSecretValue, promptConfirm };
