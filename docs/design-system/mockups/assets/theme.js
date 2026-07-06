/* Class-based dark mode for the mockups. Applied ASAP to avoid a flash,
 * persisted in localStorage so it carries across screens.
 * Also runs the anti-flicker gate: hide shell content until Tailwind + the
 * JS-injected shell have painted, then reveal — so navigating to a fresh page
 * doesn't flash unstyled/sidebar-less content. */
(function () {
  var d = document.documentElement;
  d.classList.add("ds-loading"); // hides [data-shell-content] via shell.css until reveal
  try {
    if (localStorage.getItem("ds-theme") === "dark") {
      d.classList.add("dark");
    }
    // restore collapsed-sidebar state pre-paint so the sidebar sizes correctly
    // on first frame (no expand→collapse flash when navigating between pages).
    if (localStorage.getItem("ds-nav-collapsed") === "1") {
      d.classList.add("ds-nav-collapsed");
    }
  } catch (e) {}
  // Reveal once the DOM is parsed (Tailwind CDN has generated styles and the
  // end-of-body shell script has mounted the sidebar). rAF adds one safe frame.
  function reveal() { requestAnimationFrame(function () { d.classList.remove("ds-loading"); }); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", reveal);
  } else {
    reveal();
  }
  window.dsToggleTheme = function () {
    var dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("ds-theme", dark ? "dark" : "light");
    } catch (e) {}
  };
})();
