// ============================================================
// sidebar.js — Sidebar Toggle Manager (Mobile + Desktop)
// ============================================================

(function () {
  'use strict';

  var sidebar = null;
  var overlay = null;
  var menuBtn = null;
  var isOpen = false;

  function init() {
    sidebar = document.getElementById('sidebar');
    overlay = document.getElementById('sidebackdrop') || document.getElementById('sidebar-overlay');
    menuBtn = document.getElementById('menu-btn');

    if (!sidebar) return;

    if (menuBtn) {
      menuBtn.removeAttribute('onclick');
      menuBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleSidebar();
      });
      menuBtn.addEventListener('touchend', function (e) {
        e.preventDefault();
        toggleSidebar();
      });
    }

    if (overlay) {
      overlay.addEventListener('click', function () {
        closeSidebar();
      });
      overlay.addEventListener('touchend', function (e) {
        e.preventDefault();
        closeSidebar();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) closeSidebar();
    });

    sidebar.addEventListener('click', function (e) {
      var navItem = e.target.closest('a');
      if (navItem && window.innerWidth <= 1024) {
        setTimeout(closeSidebar, 120);
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 1024) {
        closeSidebar(true);
      }
    });
  }

  function openSidebar() {
    if (!sidebar) return;
    isOpen = true;
    
    // Tailwind classes
    sidebar.classList.remove('-translate-x-full');
    
    if (overlay) {
      overlay.classList.remove('hidden');
      setTimeout(() => overlay.classList.add('opacity-100'), 10); // for transition if any
    }

    document.body.style.overflow = 'hidden';
  }

  function closeSidebar(silent) {
    if (!sidebar) return;
    isOpen = false;
    
    // Tailwind classes
    sidebar.classList.add('-translate-x-full');

    if (overlay) {
      overlay.classList.remove('opacity-100');
      setTimeout(() => overlay.classList.add('hidden'), 280);
    }

    document.body.style.overflow = '';
  }

  function toggleSidebar() {
    if (isOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  window.openSidebar = openSidebar;
  window.closeSidebar = closeSidebar;
  window.toggleSidebar = toggleSidebar;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
