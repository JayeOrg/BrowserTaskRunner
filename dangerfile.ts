import { danger, warn, markdown } from "danger";

const pr = danger.github.pr;
const modified = danger.git.modified_files;
const created = danger.git.created_files;
const deleted = danger.git.deleted_files;
const allChanged = [...modified, ...created];

// -- PR size ------------------------------------------------------------------

const additions = pr.additions ?? 0;
const deletions = pr.deletions ?? 0;
const totalChanges = additions + deletions;

const allFiles = [...allChanged, ...deleted];
const docsOnly = allFiles.every((f) => f.endsWith(".md"));

if (totalChanges > 800 && !docsOnly) {
  warn(
    `This PR has ${totalChanges} lines changed. ` +
      `PRs over 800 lines have significantly lower review quality. ` +
      `Consider breaking this into smaller PRs.`,
  );
} else if (totalChanges > 400 && !docsOnly) {
  warn(
    `This PR has ${totalChanges} lines changed. ` +
      `Aim for under 400 lines for thorough reviews.`,
  );
}

// -- Missing tests ------------------------------------------------------------

const hasStackChanges = allChanged.some(
  (f) => f.startsWith("stack/") && !f.endsWith(".md"),
);
const hasTestChanges = allChanged.some((f) => f.startsWith("tests/"));

if (hasStackChanges && !hasTestChanges) {
  warn(
    "This PR changes code in `stack/` but has no changes in `tests/`. " +
      "Was this intentional?",
  );
}

// -- High-risk file changes ---------------------------------------------------

const highRiskPatterns: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^stack\/vault\/crypto\.ts$/, label: "cryptographic operations" },
  { pattern: /^stack\/vault\//, label: "vault/secrets" },
  { pattern: /^stack\/infra\//, label: "infrastructure" },
  { pattern: /^\.env/, label: "environment config" },
  { pattern: /docker-compose\.yml$/, label: "Docker Compose" },
  { pattern: /Dockerfile$/, label: "Dockerfile" },
  {
    pattern: /^stack\/extension\/messages\/commands\//,
    label: "extension command",
  },
  { pattern: /^\.github\/workflows\//, label: "CI/CD pipeline" },
];

const riskyFiles = allChanged.flatMap((f) =>
  highRiskPatterns
    .filter((p) => p.pattern.test(f))
    .map((p) => `- \`${f}\` (${p.label})`),
);

if (riskyFiles.length > 0) {
  const unique = [...new Set(riskyFiles)];
  warn(
    `**High-attention files changed:**\n${unique.join("\n")}\n\n` +
      `These files affect critical systems -- review carefully.`,
  );
}

// -- PR description -----------------------------------------------------------

if (!pr.body || pr.body.length < 50) {
  warn(
    "PR description is very short. A good description helps " +
      "understand intent before reading code.",
  );
}

// -- Convention checks --------------------------------------------------------

const colocatedTests = allChanged.filter(
  (f) => f.startsWith("stack/") && /\.(test|spec)\.ts$/.test(f),
);
if (colocatedTests.length > 0) {
  warn(
    `Tests should live in \`tests/\`, not co-located in \`stack/\`:\n` +
      colocatedTests.map((f) => `- \`${f}\``).join("\n"),
  );
}

const barrelFiles = created.filter(
  (f) => f.startsWith("stack/") && /\/index\.ts$/.test(f),
);
if (barrelFiles.length > 0) {
  warn(
    `No barrel/index files in \`stack/\`. Import from the actual source module:\n` +
      barrelFiles.map((f) => `- \`${f}\``).join("\n"),
  );
}

// -- Change map ---------------------------------------------------------------

const MODULE_AREAS: Record<string, string> = {
  "stack/browser": "Browser (WS bridge)",
  "stack/extension": "Extension (Chrome automation)",
  "stack/framework": "Framework (orchestration)",
  "stack/projects": "Projects (site-specific tasks)",
  "stack/vault": "Vault (secrets)",
  "stack/infra": "Infra (Docker/startup)",
  tests: "Tests",
  ".github": "CI/CD",
};

const filesByArea = new Map<string, string[]>();

for (const f of allChanged) {
  let area = "Root config";
  for (const [prefix, label] of Object.entries(MODULE_AREAS)) {
    if (f.startsWith(prefix)) {
      area = label;
      break;
    }
  }
  const files = filesByArea.get(area);
  if (files) {
    files.push(f);
  } else {
    filesByArea.set(area, [f]);
  }
}

let changeMap = "## Change Map\n\n";
changeMap += "| Area | Files Changed |\n|---|---|\n";
for (const [area, files] of filesByArea) {
  changeMap += `| ${area} | ${files.length} |\n`;
}

if (deleted.length > 0) {
  changeMap += `\n**${deleted.length} file(s) deleted.**\n`;
}

changeMap += "\n*Review in logical order, not alphabetical.*";

markdown(changeMap);
