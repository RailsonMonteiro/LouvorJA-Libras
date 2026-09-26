export interface NavItem {
  name: string
  /**
   * Material Design Icons class (the same icon set used by LouvorJA), or a Flaticon UIcons class
   * ("fi fi-rr-...", see AppSidebar.vue) for the one item that uses it.
   */
  icon: string
  /** vue-i18n key of the label */
  label: string
  /** `main` items sit in the middle of the sidebar, `footer` items at the bottom. */
  area: 'main' | 'footer'
}

export const navItems: NavItem[] = [
  { name: 'home', icon: 'mdi-home', label: 'nav.home', area: 'main' },
  { name: 'projection', icon: 'mdi-projector-screen', label: 'nav.projection', area: 'main' },
  { name: 'slides', icon: 'mdi-presentation', label: 'nav.slides', area: 'main' },
  { name: 'louvorja', icon: 'fi fi-rr-link', label: 'nav.louvorja', area: 'main' },
  { name: 'about', icon: 'fi fi-sr-info', label: 'nav.about', area: 'footer' },
  { name: 'settings', icon: 'mdi-cog', label: 'nav.settings', area: 'footer' }
]
