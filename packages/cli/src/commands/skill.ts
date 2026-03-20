import chalk from 'chalk';
import { input, select, confirm } from '@inquirer/prompts';
import { SkillLoader, type SkillDefinition } from '@mct-madev/core';

const loader = new SkillLoader();

// ── Skill init ────────────────────────────────────────────────────

export async function doSkillInit(): Promise<void> {
  loader.init();
  console.log(chalk.green('\n  ✓ .madev directory initialized'));
  console.log(chalk.dim(`    Skills dir:   ${loader.paths.skillsDir}`));
  console.log(chalk.dim(`    Guidelines:   ${loader.paths.guidelinesPath}`));
}

// ── Skill list ────────────────────────────────────────────────────

export async function doSkillList(): Promise<void> {
  const skills = loader.loadSkills();

  if (skills.length === 0) {
    console.log(chalk.yellow('No skills found. Run "Skill init" first, then add skills.'));
    return;
  }

  const header = ` ${'Name'.padEnd(25)} ${'Description'.padEnd(40)} ${'Roles'.padEnd(20)} Keywords`;
  console.log(chalk.bold(header));
  for (const s of skills) {
    const roles = s.definition.roles?.join(', ') || 'all';
    const keywords = s.definition.keywords?.join(', ') || '-';
    console.log(
      ` ${s.definition.name.padEnd(25)} ${s.definition.description.slice(0, 38).padEnd(40)} ${roles.padEnd(20)} ${keywords}`,
    );
  }
  console.log(`\nTotal: ${skills.length} skill(s)`);
}

// ── Skill show ────────────────────────────────────────────────────

export async function doSkillShow(): Promise<void> {
  const skills = loader.loadSkills();
  if (skills.length === 0) {
    console.log(chalk.yellow('No skills found.'));
    return;
  }

  const name = await select({
    message: 'Select skill:',
    choices: skills.map((s) => ({ name: `${s.definition.name} — ${s.definition.description}`, value: s.definition.name })),
  });

  const skill = skills.find((s) => s.definition.name === name);
  if (!skill) return;

  const d = skill.definition;
  console.log(`\n${chalk.bold(`Skill: ${d.name}`)}`);
  console.log(`  ${chalk.dim('Description:')} ${d.description}`);
  console.log(`  ${chalk.dim('File:')}        ${skill.fileName}`);
  console.log(`  ${chalk.dim('Roles:')}       ${d.roles?.join(', ') || 'all'}`);
  console.log(`  ${chalk.dim('Keywords:')}    ${d.keywords?.join(', ') || '-'}`);
  console.log(`  ${chalk.dim('Handler:')}     ${d.handler ?? 'llm'}`);
  console.log(`  ${chalk.dim('Parameters:')}`);
  const props = d.input_schema.properties;
  const required = d.input_schema.required ?? [];
  for (const [key, val] of Object.entries(props)) {
    const req = required.includes(key) ? chalk.red('*') : ' ';
    console.log(`    ${req} ${key}: ${val.type} — ${val.description ?? ''}`);
  }
}

// ── Skill add (interactive) ───────────────────────────────────────

export async function doSkillAdd(): Promise<void> {
  const name = await input({ message: 'Skill name (snake_case):' });
  if (!name.trim()) {
    console.log(chalk.red('Name is required.'));
    return;
  }

  const description = await input({ message: 'Description:' });
  if (!description.trim()) {
    console.log(chalk.red('Description is required.'));
    return;
  }

  // Parameters
  const properties: Record<string, { type: string; description: string }> = {};
  const required: string[] = [];

  let addMore = true;
  while (addMore) {
    const wantParam = await confirm({ message: 'Add a parameter?', default: Object.keys(properties).length === 0 });
    if (!wantParam) break;

    const paramName = await input({ message: 'Parameter name:' });
    const paramType = await select({
      message: 'Type:',
      choices: [
        { name: 'string', value: 'string' },
        { name: 'number', value: 'number' },
        { name: 'boolean', value: 'boolean' },
        { name: 'array', value: 'array' },
      ],
    });
    const paramDesc = await input({ message: 'Description:' });
    const isRequired = await confirm({ message: 'Required?', default: true });

    properties[paramName] = { type: paramType, description: paramDesc };
    if (isRequired) required.push(paramName);

    addMore = true;
  }

  // Roles
  const rolesInput = await input({ message: 'Roles (comma-separated, empty=all):' });
  const roles = rolesInput.trim() ? rolesInput.split(',').map((r) => r.trim().toUpperCase()) : undefined;

  // Keywords
  const keywordsInput = await input({ message: 'Keywords for auto-match (comma-separated):' });
  const keywords = keywordsInput.trim() ? keywordsInput.split(',').map((k) => k.trim().toLowerCase()) : undefined;

  const definition: SkillDefinition = {
    name: name.trim(),
    description: description.trim(),
    input_schema: {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    },
    roles,
    keywords,
  };

  const filePath = loader.saveSkill(definition);
  console.log(chalk.green(`\n  ✓ Skill '${name}' saved to ${filePath}`));
}

// ── Skill remove ──────────────────────────────────────────────────

export async function doSkillRemove(): Promise<void> {
  const skills = loader.loadSkills();
  if (skills.length === 0) {
    console.log(chalk.yellow('No skills found.'));
    return;
  }

  const name = await select({
    message: 'Select skill to remove:',
    choices: skills.map((s) => ({ name: s.definition.name, value: s.definition.name })),
  });

  const yes = await confirm({ message: `Remove skill '${name}'?`, default: false });
  if (!yes) return;

  loader.removeSkill(name);
  console.log(chalk.green(`  ✓ Skill '${name}' removed`));
}

// ── Skill validate ────────────────────────────────────────────────

export async function doSkillValidate(): Promise<void> {
  const skills = loader.loadSkills();
  if (skills.length === 0) {
    console.log(chalk.yellow('No skills found.'));
    return;
  }

  let valid = 0;
  let invalid = 0;

  for (const s of skills) {
    const d = s.definition;
    const errors: string[] = [];

    if (!d.name) errors.push('missing name');
    if (!d.description) errors.push('missing description');
    if (!d.input_schema) errors.push('missing input_schema');
    else if (d.input_schema.type !== 'object') errors.push('input_schema.type must be "object"');

    if (errors.length > 0) {
      console.log(chalk.red(`  ✗ ${s.fileName}: ${errors.join(', ')}`));
      invalid++;
    } else {
      console.log(chalk.green(`  ✓ ${s.fileName} (${d.name})`));
      valid++;
    }
  }

  console.log(`\n${valid} valid, ${invalid} invalid`);
}
