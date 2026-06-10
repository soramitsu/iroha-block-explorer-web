import { readonly, ref } from 'vue';

const isLangOpen = ref(false);
const isMenuOpen = ref(false);
const isNodeSettingsOpen = ref(false);

function toggleLang() {
  isLangOpen.value = !isLangOpen.value;
  isMenuOpen.value = false;
  isNodeSettingsOpen.value = false;
}

function toggleMenu() {
  isLangOpen.value = false;
  isMenuOpen.value = !isMenuOpen.value;
  isNodeSettingsOpen.value = false;
}

function toggleNodeSettings() {
  isLangOpen.value = false;
  isMenuOpen.value = false;
  isNodeSettingsOpen.value = !isNodeSettingsOpen.value;
}

export const useLangDropdown = () => ({
  isOpen: readonly(isLangOpen),
  toggle: toggleLang,
});

export const useMenuDropdown = () => ({
  isOpen: readonly(isMenuOpen),
  toggle: toggleMenu,
});

export const useNodeSettingsDropdown = () => ({
  isOpen: readonly(isNodeSettingsOpen),
  toggle: toggleNodeSettings,
});
