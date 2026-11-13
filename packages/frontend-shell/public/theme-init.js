// dsl-ui's useTheme only applies the `dark` class after the first render; doing it here avoids a light flash.
// A file of its own (not an inline script) because the page's Content-Security-Policy allows scripts of this origin only.
var storedTheme = localStorage.getItem('theme');
if (storedTheme === 'dark' || (storedTheme === null && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark');
}
