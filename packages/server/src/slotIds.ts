import { MODULE_ID_PATTERN } from './moduleId.js';

// Slots the app-core shell itself renders. Every other slot belongs to a module and is named
// `<providerId>:<local>` (decision 82), so two modules can never claim the same name.
export const SHELL_SLOTS: readonly string[] = ['dashboard', 'nav', 'route', 'navbar', 'overlay'];

// The part after the provider id; same charset as a module id.
export const SLOT_LOCAL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const SLOT_LOCAL_RULE = 'start with a letter or digit and contain only letters, digits, "_" and "-"';

// The local name of a module's side menu. `<providerId>:nav` is a slot every module has: a module that `requires` the
// provider contributes a `page` to it to get an entry in the provider's side menu. It is never declared in
// `expose.slots` (the provider does not choose it, it is always there), which is why that name is reserved.
export const MENU_SLOT_LOCAL = 'nav';

// Splits `<providerId>:<local>`; undefined for a shell slot or anything malformed.
export function splitCustomSlot(slot: string): { providerId: string; local: string } | undefined {
  const parts = slot.split(':');
  const [providerId, local] = parts;
  if (parts.length !== 2 || providerId === undefined || local === undefined) {
    return undefined;
  }
  return MODULE_ID_PATTERN.test(providerId) && SLOT_LOCAL_PATTERN.test(local) ? { providerId, local } : undefined;
}

// The provider whose side menu `slot` targets (`flow:nav` -> "flow"), or undefined when it is not a menu slot.
export function menuSlotProvider(slot: string): string | undefined {
  const custom = splitCustomSlot(slot);
  return custom?.local === MENU_SLOT_LOCAL ? custom.providerId : undefined;
}

// Why a slot id is not allowed, or undefined when it is.
export function slotIdProblem(slot: string): string | undefined {
  if (SHELL_SLOTS.includes(slot) || splitCustomSlot(slot) !== undefined) {
    return undefined;
  }
  return `slot "${slot}" is not a shell slot (${SHELL_SLOTS.join(', ')}) and not of the form "<providerId>:<slot>". Prefix a custom slot with the id of the module that exposes it, e.g. "slot-provider:${SLOT_LOCAL_PATTERN.test(slot) ? slot : 'shared-slot'}".`;
}
