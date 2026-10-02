import {colors} from '@erp/ui';
import type {PhaseStatus, ProjectStatus, ProposalStatus, RequirementStatus} from '@erp/domain';

/** Fondo y texto de una insignia. Los colores de estado llevan texto negro; el bosque, blanco. */
export interface Tone {
  background: string;
  text: string;
  border?: string;
}

const neutral: Tone = {background: colors.white, text: colors.ink, border: colors.line};
const amber: Tone = {background: colors.amber, text: colors.ink};
const success: Tone = {background: colors.success, text: colors.ink};
const terracotta: Tone = {background: colors.terracotta, text: colors.ink};
const forest: Tone = {background: colors.forestSoft, text: colors.white};

export const tones = {neutral, amber, success, terracotta, forest, lime: {background: colors.lime, text: colors.ink}};

export const projectStatusTone: Record<ProjectStatus, Tone> = {
  planning: neutral,
  in_progress: amber,
  certifying: forest,
  completed: success,
};

export const proposalStatusTone: Record<ProposalStatus, Tone> = {
  draft: neutral,
  in_review: amber,
  approved: success,
  rejected: terracotta,
};

export const stepStatusTone: Record<PhaseStatus | RequirementStatus, Tone> = {
  pending: neutral,
  in_progress: amber,
  in_review: amber,
  completed: success,
  met: success,
};
