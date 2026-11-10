const choices = [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']];
export function appearanceControl() {
  const selected = window.afterclassAppearance.get();
  return `<label class="appearance-control"><span class="sr-only">Appearance</span><select data-appearance-select aria-label="Appearance" onchange="afterclassAppearance.set(this.value)">${choices.map(([value,label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
}
export function appearanceSettings() {
  return `<section class="preference-group appearance-settings"><h2>Appearance</h2><p>Choose a look, or follow your device.</p><div class="appearance-options" role="group" aria-label="Colour theme">${choices.map(([value,label]) => `<button type="button" data-appearance="${value}" aria-pressed="${window.afterclassAppearance.get() === value}" onclick="afterclassAppearance.set('${value}')"><span class="appearance-preview appearance-preview-${value}" aria-hidden="true"><i></i><b></b><em></em></span>${label}</button>`).join('')}</div></section>`;
}
