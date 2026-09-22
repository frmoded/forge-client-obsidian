// Drain 2026-09-21-1756. Local-runnable copy of Obsidian's community-plugin
// review ruleset, per cc-prompt-queue.md's investigation-before-design
// discipline — this gives an authoritative, complete finding list instead
// of relying on forge-core's (explicitly partial) transcription of the live
// review page.
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*"],
        },
      },
    },
  },
]);
