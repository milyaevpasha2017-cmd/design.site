/**
 * Decap 3.17.1 leaves the entry list at its pre-save version for the GitHub
 * backend. The dirty check compares against that list: reverting a saved edit
 * can therefore look "published" even though it differs from the saved file.
 * Enable Decap's existing refresh-after-persist path, also used by its Turbo
 * backends. This refreshes the saved baseline without reloading the editor,
 * replacing inputs, or changing the backend name / authentication session.
 * The browser regression in tests/browser/admin-save.cjs covers this case.
 */
export function enableSaveRefresh(cms, backendName = 'github') {
  const backend = cms.getBackend(backendName);
  if (!backend?.BackendClass) throw new Error('Не удалось настроить сохранение редактора. Обновите страницу админки.');
  backend.BackendClass.prototype.reloadEntriesAfterPersist = true;
}
