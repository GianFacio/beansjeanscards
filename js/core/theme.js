// Shared light/dark theme behavior for the collection and detail pages.
// The selected theme is saved in browser storage between visits.
const themeToggle = document.querySelector('.theme-toggle');
const savedTheme = localStorage.getItem('card-store-theme');

// Apply a theme to the page and update the toggle's accessible label.
function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const isDark = theme === 'dark';
    themeToggle.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} mode`);
    themeToggle.title = `Switch to ${isDark ? 'light' : 'dark'} mode`;
    themeToggle.setAttribute('aria-pressed', String(isDark));
}

// Restore the saved theme, using light mode when no preference is saved.
setTheme(savedTheme === 'dark' ? 'dark' : 'light');

// Save and apply the alternate theme when the icon button is clicked.
themeToggle.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('card-store-theme', nextTheme);
    setTheme(nextTheme);
});
