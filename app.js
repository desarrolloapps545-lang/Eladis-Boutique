import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://qsrksmofmzgumypmsaob.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_eDa8I1-LttvCUy2nCHBreA_0WCdzvqx';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// ===== Role helpers =====
export function normalizeRole(role) {
    return String(role || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

export function isFullAccessRole(role) {
    const r = normalizeRole(role);
    return r === 'propietario' || r === 'desarrollador';
}

export async function getCurrentUserProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('users')
        .select('user_id, name, email, role')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error) {
        console.error('Error fetching user profile:', error);
        return {
            user_id: user.id,
            name: user.user_metadata?.name || user.email,
            email: user.email,
            role: user.user_metadata?.role || null
        };
    }

    return data || {
        user_id: user.id,
        name: user.user_metadata?.name || user.email,
        email: user.email,
        role: user.user_metadata?.role || null
    };
}

const PAGE_LOADING_DURATION = 1200;
let pageLoadingStartedAt = 0;
let pageLoadingHideTimer = null;

export function showPageLoading() {
    if (!document.body) return;

    let screen = document.querySelector('.page-loading-screen');
    if (!screen) {
        screen = document.createElement('div');
        screen.className = 'page-loading-screen';
        screen.setAttribute('role', 'status');
        screen.setAttribute('aria-live', 'polite');

        const content = document.createElement('div');
        content.className = 'page-loading-content';

        const logo = document.createElement('img');
        logo.className = 'page-loading-logo';
        logo.src = 'img/logo_eladis_boutique.png';
        logo.alt = 'Eladis Boutique';

        const spinner = document.createElement('div');
        spinner.className = 'page-loading-spinner';

        content.append(logo, spinner);
        screen.append(content);
        document.body.append(screen);
    }

    if (pageLoadingHideTimer) {
        clearTimeout(pageLoadingHideTimer);
        pageLoadingHideTimer = null;
    }
    pageLoadingStartedAt = Date.now();
    screen.hidden = false;
    document.body.classList.add('page-loading');
    document.body.setAttribute('aria-busy', 'true');
}

export function hidePageLoading() {
    const elapsed = Date.now() - pageLoadingStartedAt;
    const remaining = Math.max(0, PAGE_LOADING_DURATION - elapsed);

    if (pageLoadingHideTimer) {
        clearTimeout(pageLoadingHideTimer);
        pageLoadingHideTimer = null;
    }

    if (remaining > 0) {
        pageLoadingHideTimer = setTimeout(() => {
            const screen = document.querySelector('.page-loading-screen');
            if (screen) screen.remove();
            document.body?.classList.remove('page-loading');
            document.body?.setAttribute('aria-busy', 'false');
            pageLoadingHideTimer = null;
        }, remaining);
        return;
    }

    const screen = document.querySelector('.page-loading-screen');
    if (screen) screen.remove();
    document.body?.classList.remove('page-loading');
    document.body?.setAttribute('aria-busy', 'false');
}

// Protects a page: redirects to login when there is no session, and
// redirects to the dashboard when the user lacks full access.
export async function guardPage({ requireFullAccess = false } = {}) {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        window.location.href = 'index.html';
        return null;
    }

    const profile = await getCurrentUserProfile();

    if (requireFullAccess && !isFullAccessRole(profile?.role)) {
        window.location.href = 'dashboard.html';
        return null;
    }

    return profile;
}

function initLoginPage() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');
    const btnText = loginBtn.querySelector('.btn-text');
    const btnLoader = loginBtn.querySelector('.btn-loader');
    const errorMessage = document.getElementById('errorMessage');
    const togglePassword = document.querySelector('.toggle-password');
    const eyeOpen = togglePassword.querySelector('.eye-open');
    const eyeClosed = togglePassword.querySelector('.eye-closed');

    const modal = document.getElementById('verificationModal');
    const modalIcon = document.getElementById('modalIcon');
    const modalMessage = document.getElementById('modalMessage');
    const modalClose = document.getElementById('modalClose');
    const modalConfirm = document.getElementById('modalConfirm');

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'flex';
        emailInput.style.borderColor = 'var(--error)';
        passwordInput.style.borderColor = 'var(--error)';
    }

    function hideError() {
        errorMessage.style.display = 'none';
        emailInput.style.borderColor = '';
        passwordInput.style.borderColor = '';
    }

    function setLoading(loading) {
        loginBtn.disabled = loading;
        btnText.style.display = loading ? 'none' : 'inline';
        btnLoader.style.display = loading ? 'flex' : 'none';
    }

    function showModal(success, message) {
        modalIcon.className = 'modal-icon ' + (success ? 'success' : 'error');
        modalIcon.innerHTML = success
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        modalMessage.textContent = message;
        modal.classList.add('active');
    }

    function hideModal() {
        modal.classList.remove('active');
    }

    async function verifyUserInTable(userId) {
        const { data, error } = await supabase
            .from('users')
            .select('user_id')
            .eq('user_id', userId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return { exists: false, error: null };
            }
            return { exists: false, error };
        }

        return { exists: !!data, error: null };
    }

    togglePassword.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        eyeOpen.style.display = isPassword ? 'none' : 'block';
        eyeClosed.style.display = isPassword ? 'block' : 'none';
    });

    modalClose.addEventListener('click', () => {
        hideModal();
        const isSuccess = modalIcon.classList.contains('success');
        if (isSuccess) {
            window.location.href = 'dashboard.html';
        } else {
            supabase.auth.signOut();
        }
    });

    modalConfirm.addEventListener('click', () => {
        const isSuccess = modalIcon.classList.contains('success');
        if (isSuccess) {
            window.location.href = 'dashboard.html';
        } else {
            supabase.auth.signOut();
        }
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            const isSuccess = modalIcon.classList.contains('success');
            if (isSuccess) {
                window.location.href = 'dashboard.html';
            } else {
                supabase.auth.signOut();
            }
            hideModal();
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showError('Por favor completa todos los campos');
            return;
        }

        if (!email.includes('@')) {
            showError('Ingresa un correo electrónico válido');
            return;
        }

        setLoading(true);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                throw error;
            }

            if (data.user) {
                const { exists, error: verifyError } = await verifyUserInTable(data.user.id);

                if (verifyError) {
                    console.error('Verification error:', verifyError);
                    showModal(false, 'Error al verificar el usuario. Intenta de nuevo.');
                    return;
                }

                if (exists) {
                    const remember = document.getElementById('remember').checked;
                    if (remember) {
                        localStorage.setItem('eladis_remember_email', email);
                    } else {
                        localStorage.removeItem('eladis_remember_email');
                    }

                    showModal(true, 'Usuario registrado e inicio de sesión correcto');
                } else {
                    await supabase.auth.signOut();
                    showModal(false, 'Error de verificación: El usuario no existe en el sistema');
                }
            }
        } catch (err) {
            console.error('Login error:', err);
            let message = 'Error al iniciar sesión';

            if (err.message.includes('Invalid login credentials') || err.message.includes('Email not confirmed')) {
                message = 'Credenciales inválidas. Verifica tu correo y contraseña.';
            } else if (err.message.includes('User not found')) {
                message = 'No existe una cuenta con este correo electrónico.';
            } else if (err.message.includes('Too many requests')) {
                message = 'Demasiados intentos. Intenta de nuevo en unos minutos.';
            } else if (err.message.includes('network') || err.message.includes('fetch')) {
                message = 'Error de conexión. Verifica tu internet.';
            } else if (err.message) {
                message = err.message;
            }

            showError(message);
        } finally {
            setLoading(false);
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        const rememberedEmail = localStorage.getItem('eladis_remember_email');
        if (rememberedEmail) {
            emailInput.value = rememberedEmail;
            document.getElementById('remember').checked = true;
            passwordInput.focus();
        } else {
            emailInput.focus();
        }

        const { data: { session } } = supabase.auth.getSession();
        if (session) {
            window.location.href = 'dashboard.html';
        }
    });

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            window.location.href = 'dashboard.html';
        }
    });
}

initLoginPage();