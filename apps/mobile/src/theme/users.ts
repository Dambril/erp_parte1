import type {Role, UserStatus} from '@erp/domain';
import {tones, type Tone} from './status';

export const userStatusTone: Record<UserStatus, Tone> = {
  active: tones.success,
  invited: tones.amber,
  deactivated: tones.neutral,
};

/** Quien administra se distingue en verde bosque; los demás roles, neutros. */
export function roleTone(role: Role): Tone {
  return role === 'admin' || role === 'superadmin' ? tones.forest : tones.neutral;
}
