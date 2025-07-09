// --- COMMON SCRIPT FOR ALL PAGES ---
document.addEventListener('DOMContentLoaded', () => {
    // --- THEME MANAGEMENT ---
    const THEME_KEY = 'finvestikTheme';
    const themeToggle = document.getElementById('theme-toggle');
    const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 sm:w-6 sm:h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-6.364-.386 1.591-1.591M3 12h2.25m.386-6.364 1.591 1.591" /></svg>`;
    const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 sm:w-6 sm:h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" /></svg>`;

    function applyTheme(theme) {
        if (theme === 'light') {
            document.documentElement.classList.add('light');
            if (themeToggle) themeToggle.innerHTML = moonIcon;
        } else {
            document.documentElement.classList.remove('light');
            if (themeToggle) themeToggle.innerHTML = sunIcon;
        }
    }
    
    function loadTheme() {
        const preferredTheme = localStorage.getItem(THEME_KEY);
        const systemTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        applyTheme(preferredTheme || systemTheme);
    }
    
    function toggleAndSaveTheme() {
        const newTheme = document.documentElement.classList.contains('light') ? 'dark' : 'light';
        applyTheme(newTheme);
        localStorage.setItem(THEME_KEY, newTheme);
    }
    
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleAndSaveTheme);
    }

    // --- MOBILE MENU MANAGEMENT ---
    const hamburgerMenuButton = document.getElementById('hamburger-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');

    function toggleMobileMenu() {
        if (!hamburgerMenuButton || !mobileMenu) return;
        const isExpanded = hamburgerMenuButton.getAttribute('aria-expanded') === 'true';
        hamburgerMenuButton.setAttribute('aria-expanded', String(!isExpanded));
        mobileMenu.classList.toggle('hidden');
        const icons = hamburgerMenuButton.querySelectorAll('svg');
        if (icons.length === 2) {
            icons[0].classList.toggle('hidden');
            icons[1].classList.toggle('hidden');
        }
    }

    if(hamburgerMenuButton) {
        hamburgerMenuButton.addEventListener('click', toggleMobileMenu);
    }

    // --- CHANGE: New robust active link highlighting ---
    function setActiveNavLink() {
        // Helper to normalize paths for comparison (e.g., removes trailing slashes)
        const normalizePath = (path) => path.replace(/\/$/, '');

        const currentPagePath = normalizePath(window.location.pathname);

        // Target both desktop and mobile links
        document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => {
            // The browser automatically resolves the full path for us in link.pathname
            const linkPath = normalizePath(link.pathname);
            
            if (linkPath === currentPagePath) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }
    
    // --- FOOTER YEAR ---
    const currentYearElement = document.getElementById('current-year');
    if (currentYearElement) {
        currentYearElement.textContent = new Date().getFullYear();
    }
    
    // --- INITIAL LOAD SEQUENCE ---
    loadTheme();
    setActiveNavLink(); // Set the active link on page load
});