import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import type { SkillDefinition, LoadedSkill, Guidelines } from './types.js';

const MADEV_DIR = '.madev';
const SKILLS_DIR = 'agents/skills';
const GUIDELINES_FILE = 'madev.md';

export class SkillLoader {
  private baseDir: string;
  private skillsDir: string;
  private guidelinesPath: string;

  constructor(baseDir?: string) {
    this.baseDir = resolve(baseDir ?? process.cwd(), MADEV_DIR);
    this.skillsDir = resolve(this.baseDir, SKILLS_DIR);
    this.guidelinesPath = resolve(this.baseDir, GUIDELINES_FILE);
  }

  /** Initialize .madev directory structure */
  init(): void {
    if (!existsSync(this.skillsDir)) {
      mkdirSync(this.skillsDir, { recursive: true });
    }
    if (!existsSync(this.guidelinesPath)) {
      writeFileSync(
        this.guidelinesPath,
        `# MADEV Guidelines\n\n## General Rules\n\n- Follow project conventions\n- Write clean, maintainable code\n- Include appropriate error handling\n\n## Agent-Specific Guidelines\n\n<!-- Add role-specific instructions here -->\n`,
        'utf-8',
      );
    }
  }

  /** Load all skill definitions from .madev/agents/skills/ */
  loadSkills(): LoadedSkill[] {
    if (!existsSync(this.skillsDir)) return [];

    const files = readdirSync(this.skillsDir).filter((f) => f.endsWith('.json'));
    const skills: LoadedSkill[] = [];

    for (const file of files) {
      const filePath = resolve(this.skillsDir, file);
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const definition = JSON.parse(raw) as SkillDefinition;
        if (this.validateSkill(definition)) {
          skills.push({ definition, filePath, fileName: file });
        }
      } catch {
        // Skip malformed files
      }
    }

    return skills;
  }

  /** Load a single skill by name */
  loadSkill(name: string): LoadedSkill | undefined {
    const skills = this.loadSkills();
    return skills.find((s) => s.definition.name === name);
  }

  /** Filter skills relevant to a given agent role and task description */
  selectSkills(
    allSkills: LoadedSkill[],
    agentRole?: string,
    taskDescription?: string,
  ): SkillDefinition[] {
    let filtered = allSkills;

    // Filter by role if skill specifies roles
    if (agentRole) {
      filtered = filtered.filter(
        (s) => !s.definition.roles || s.definition.roles.length === 0 || s.definition.roles.includes(agentRole),
      );
    }

    // Rank by keyword match if task description provided
    if (taskDescription) {
      const text = taskDescription.toLowerCase();
      filtered = filtered
        .map((s) => {
          const keywords = s.definition.keywords ?? [];
          const score = keywords.filter((kw) => text.includes(kw.toLowerCase())).length;
          return { skill: s, score };
        })
        .sort((a, b) => b.score - a.score)
        .map((s) => s.skill);
    }

    return filtered.map((s) => s.definition);
  }

  /** Load guidelines from .madev/madev.md */
  loadGuidelines(): Guidelines | undefined {
    if (!existsSync(this.guidelinesPath)) return undefined;
    try {
      const content = readFileSync(this.guidelinesPath, 'utf-8');
      return { content, filePath: this.guidelinesPath };
    } catch {
      return undefined;
    }
  }

  /** Save a skill definition to .madev/agents/skills/ */
  saveSkill(definition: SkillDefinition): string {
    if (!existsSync(this.skillsDir)) {
      mkdirSync(this.skillsDir, { recursive: true });
    }
    const fileName = `${definition.name}.json`;
    const filePath = resolve(this.skillsDir, fileName);
    writeFileSync(filePath, JSON.stringify(definition, null, 2), 'utf-8');
    return filePath;
  }

  /** Remove a skill file */
  removeSkill(name: string): boolean {
    const skill = this.loadSkill(name);
    if (!skill) return false;
    const { unlinkSync } = require('node:fs');
    unlinkSync(skill.filePath);
    return true;
  }

  /** List skill file names */
  listSkillNames(): string[] {
    return this.loadSkills().map((s) => s.definition.name);
  }

  /** Validate a skill definition has required fields */
  private validateSkill(def: unknown): def is SkillDefinition {
    if (!def || typeof def !== 'object') return false;
    const d = def as Record<string, unknown>;
    if (typeof d.name !== 'string' || !d.name) return false;
    if (typeof d.description !== 'string' || !d.description) return false;
    if (!d.input_schema || typeof d.input_schema !== 'object') return false;
    const schema = d.input_schema as Record<string, unknown>;
    if (schema.type !== 'object') return false;
    return true;
  }

  /** Get paths info */
  get paths() {
    return {
      baseDir: this.baseDir,
      skillsDir: this.skillsDir,
      guidelinesPath: this.guidelinesPath,
    };
  }
}
