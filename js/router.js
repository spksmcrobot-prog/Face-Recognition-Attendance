// ============================================================
// router.js — SPA Navigation Router
// ============================================================

(function() {
  'use strict';

  var loadedScripts = new Set();

  function initRouter() {
    // Record initially loaded scripts
    document.querySelectorAll('script[src]').forEach(function(s) {
      loadedScripts.add(s.getAttribute('src'));
    });

    // Create a global SPA loading overlay if not exists
    var loader = document.getElementById('spa-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'spa-loader';
      loader.innerHTML = '<div style="width:40px;height:40px;border:4px solid var(--muted);border-top-color:var(--primary);border-radius:50%;animation:spin 1s linear infinite;"></div>';
      loader.style.cssText = 'position:fixed;inset:0;background:var(--background);z-index:9999;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity 0.2s ease;';
      document.body.appendChild(loader);
    }

    // Intercept clicks
    document.body.addEventListener('click', function(e) {
      var a = e.target.closest('a');
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href) return;
      
      // Ignore external links, mailto, etc.
      if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) return;
      
      // Ignore links with target="_blank"
      if (a.getAttribute('target') === '_blank') return;

      e.preventDefault();
      
      var urlObj = new URL(a.href, window.location.origin);
      if (urlObj.pathname === window.location.pathname && urlObj.hash) {
        window.location.hash = urlObj.hash;
        return;
      }

      navigate(href);
    });

    window.addEventListener('popstate', function(e) {
      navigate(window.location.href, true);
    });
  }

  var isNavigating = false;
  window.navigate = async function(url, isPopState = false) {
    if (isNavigating) return;
    isNavigating = true;
    
    var loader = document.getElementById('spa-loader');
    if (loader) {
      loader.style.pointerEvents = 'auto';
      loader.style.opacity = '1';
    }
    
    if (window.closeSidebar) window.closeSidebar();

    try {
      var response = await fetch(url);
      var htmlText = await response.text();
      
      if (!isPopState) {
        window.history.pushState(null, '', url);
      }

      var parser = new DOMParser();
      var doc = parser.parseFromString(htmlText, 'text/html');

      if (doc.title) document.title = doc.title;

      // Preserve the loader by detaching/re-appending it
      if (loader) {
        document.body.appendChild(loader);
      }

      // Extract scripts before moving children
      var scriptsToExecute = Array.from(doc.querySelectorAll('script'));

      // Re-create the body content from the parsed document
      var children = Array.from(doc.body.children);
      
      // Remove all elements in current body except the loader
      var oldChildren = Array.from(document.body.children);
      oldChildren.forEach(function(child) {
        if (child !== loader) {
          document.body.removeChild(child);
        }
      });

      // Append new children
      children.forEach(function(child) {
        if (child.id !== 'spa-loader') {
          document.body.appendChild(child);
        }
      });

      updateSidebarActiveState();

      await executeScripts(scriptsToExecute);

      window.scrollTo(0,0);
      
      document.dispatchEvent(new Event('DOMContentLoaded'));
      
    } catch (e) {
      console.error('Navigation error:', e);
      window.location.href = url;
    } finally {
      if (loader) {
        loader.style.opacity = '0';
        loader.style.pointerEvents = 'none';
      }
      isNavigating = false;
    }
  };

  function updateSidebarActiveState() {
    var path = window.location.pathname.split('/').pop() || 'index.html';
    var navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(function(item) {
      var href = item.getAttribute('href');
      if (href && href.includes(path)) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  async function executeScripts(scripts) {
    for (var i=0; i<scripts.length; i++) {
      var s = scripts[i];
      var src = s.getAttribute('src');
      
      if (src) {
        if (src.includes('firebase-') || loadedScripts.has(src)) continue;
        loadedScripts.add(src); // Add immediately to prevent concurrent loads
        try {
          await loadExternalScript(src);
        } catch(e) {
          console.error("Failed to load script", src, e);
          loadedScripts.delete(src); // remove if failed
        }
      } else {
        try {
          var code = s.textContent;
          // IMPORTANT: Convert let/const to var to prevent redeclaration errors on navigation
          code = code.replace(/\blet\s+/g, 'var ').replace(/\bconst\s+/g, 'var ');
          
          var newScript = document.createElement('script');
          newScript.textContent = code;
          document.body.appendChild(newScript);
          document.body.removeChild(newScript);
        } catch (e) {
          console.error('Error executing inline script:', e);
        }
      }
    }
  }

  function loadExternalScript(src) {
    return new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRouter);
  } else {
    initRouter();
  }

})();
