// Fixture A: minimal module, no moduleContext usage at all.
export default function register() {
  // intentionally does nothing -- validates app-core can load a module whose
  // backend has no default export side effects.
}
