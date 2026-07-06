/* OGGVO v2 — reusable portal shell for the mockups.
 *
 * Any page can adopt the sidebar + top-bar by:
 *   1. putting its page content inside  <main data-shell-content class="flex-1 p-6"> … </main>
 *   2. calling  OggvoShell.mount({ active, back, route, user, search })  at the end of <body>.
 *
 * The shell injects the sidebar (icon nav + active accent), the sticky top-bar
 * (back-link + route, global search, theme toggle, notifications, avatar menu),
 * a mobile drawer, and wires all interactions. Edit NAV once to add a new domain.
 */
(function () {
  // Base URL of the assets/ dir, captured while shell.js executes (currentScript
  // is set here). Lets us load sibling assets from a page at any folder depth.
  var SCRIPT_BASE = (function () {
    var s = document.currentScript;
    return (s && s.src ? s.src.replace(/[^/]*$/, "") : "assets/");
  })();
  // mockups root (one level above assets/) — used to make sidebar nav links
  // absolute so they resolve from a page at any folder depth.
  var MOCKUPS_ROOT = SCRIPT_BASE.replace(/assets\/$/, "");
  // ---- Central navigation (add a domain here and every page gets it) ----
  var ICONS = {
    dashboard: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 5a1 1 0 011-1h5v7H4V5zm10-1h5a1 1 0 011 1v4h-6V4zm0 9h6v6a1 1 0 01-1 1h-5v-7zM4 14h6v6H5a1 1 0 01-1-1v-5z"/></svg>',
    reviews: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.5 4.5l2 4.1 4.5.6-3.3 3.1.8 4.5-4-2.2-4 2.2.8-4.5L5 9.2l4.5-.6 2-4.1z"/></svg>',
    contacts: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 14a4 4 0 10-8 0m12.5 4a3.5 3.5 0 00-3-3.4m-11 3.4a3.5 3.5 0 013-3.4m6.5-5.1a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/></svg>',
    campaigns: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 9v4a1 1 0 001 1h2l4.5 4V4L7 8H5a1 1 0 00-1 1zm12.5-1a4 4 0 010 6"/></svg>',
    connect: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 5h14a1 1 0 011 1v8a1 1 0 01-1 1H9l-4 4V6a1 1 0 011-1z"/></svg>',
    social: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.4"/><circle cx="17" cy="6" r="2.4"/><circle cx="17" cy="18" r="2.4"/><path stroke-linecap="round" d="M8.3 10.9l6.4-3.5m0 9.2L8.3 13.1"/></svg>',
    settings: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v2m0 12v2m8-8h-2M6 12H4m13.7-5.7l-1.4 1.4M7.7 16.3l-1.4 1.4m11.4 0l-1.4-1.4M7.7 7.7L6.3 6.3"/></svg>',
    funnel: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 5h16l-6 7v6l-4 2v-8L4 5z"/></svg>',
    surveys: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 6h10M9 12h10M9 18h7M3.5 6l1 1 1.7-2M3.5 12l1 1 1.7-2M3.5 18l1 1 1.7-2"/></svg>',
    widgets: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
    admin: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z"/><path stroke-linecap="round" stroke-linejoin="round" d="M9.3 12l1.8 1.8L15 10"/></svg>',
    tutorials: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5l9 4-9 4-9-4 9-4z"/><path stroke-linecap="round" stroke-linejoin="round" d="M6 10.5V15c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-4.5"/></svg>',
    media: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path stroke-linecap="round" stroke-linejoin="round" d="M4 15l4-4 4 4 3-3 5 5"/><circle cx="9" cy="9" r="1.3"/></svg>',
  };
  // hrefs are relative to the mockups root; navItems() prefixes them with
  // MOCKUPS_ROOT so they resolve from a page at any folder depth.
  // `count` drives the nav badge. v1 only badges Reviews / Social / Surveys
  // (polled from /nav/badges); the mockup hardcodes sample counts.
  var NAV = [
    { key: "dashboard", label: "Dashboard", href: "dashboard/dashboard-funnel.html", icon: ICONS.dashboard },
    { key: "reviews", label: "Reviews", href: "reviews/reviews-list.html", icon: ICONS.reviews, count: 5 },
    { key: "design", label: "Funnel", href: "funnel/design-funnel.html", icon: ICONS.funnel },
    { key: "social", label: "Social", href: "social/social-accounts.html", icon: ICONS.social, count: 3 },
    { key: "contacts", label: "Contacts", href: "contacts/contacts-list.html", icon: ICONS.contacts },
    { key: "campaigns", label: "Campaigns", href: "campaigns/campaigns-list.html", icon: ICONS.campaigns },
    { key: "connect", label: "Connect", href: "connect/connect-inbox.html", icon: ICONS.connect },
    { key: "surveys", label: "Surveys", href: "surveys/surveys-list.html", icon: ICONS.surveys, count: 2 },
    { key: "media", label: "Media", href: "media/media-library.html", icon: ICONS.media },
    { key: "widgets", label: "Widgets", href: "widgets/widgets-list.html", icon: ICONS.widgets },
    { key: "tutorials", label: "Tutorials", href: "tutorials/tutorials.html", icon: ICONS.tutorials },
    { key: "settings", label: "Settings", href: "settings/settings.html", icon: ICONS.settings },
    { key: "admin", label: "Admin", href: "admin/admin.html", icon: ICONS.admin },
  ];

  var THEME_SUN = '<svg class="theme-sun" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path stroke-linecap="round" d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10l1.4 1.4m0-13.8l-1.4 1.4m-10 10l-1.4 1.4"/></svg>';
  var THEME_MOON = '<svg class="theme-moon" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20 13a8 8 0 11-9-9 6.5 6.5 0 109 9z"/></svg>';

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function navItems(active) {
    return NAV.map(function (it) {
      var on = it.key === active;
      // pill (expanded) + red dot (collapsed) — CSS shows the right one per state
      var badge = it.count
        ? '<span class="ds-nav-badge">' + (it.count > 99 ? "99+" : it.count) + "</span><span class=\"ds-nav-dot\"></span>"
        : "";
      return (
        '<a href="' + MOCKUPS_ROOT + it.href + '" title="' + esc(it.label) + '" class="nav-link' + (on ? " nav-link-active" : "") +
        '"' + (on ? ' aria-current="page"' : "") + ">" + it.icon +
        '<span class="ds-nav-label">' + esc(it.label) + "</span>" + badge + "</a>"
      );
    }).join("");
  }

  function sidebar(opts) {
    var u = opts.user;
    return (
      '<aside data-shell-sidebar class="ds-sidebar fixed md:static inset-y-0 left-0 z-40 shrink-0 flex flex-col -translate-x-full md:translate-x-0">' +
        '<div class="ds-brand h-16 flex items-center gap-2.5 px-4 border-b border-white/15">' +
          '<div class="ds-brand-logo h-8 w-8 rounded-card bg-white grid place-items-center font-bold text-primary-700 shadow-sm shrink-0">O</div>' +
          '<span class="ds-nav-label font-semibold text-white tracking-tight flex-1">OGGVO</span>' +
          '<button data-shell-collapse title="Collapse sidebar" aria-label="Collapse sidebar" class="ds-collapse-btn hidden md:grid h-8 w-8 place-items-center rounded-md text-white/70 hover:text-white hover:bg-white/10 shrink-0">' +
            '<svg class="ds-collapse-icon h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 7l-5 5 5 5M17 7v10"/></svg>' +
          "</button>" +
        "</div>" +
        '<nav class="flex-1 p-3 space-y-0.5 text-sm overflow-y-auto">' + navItems(opts.active) + "</nav>" +
        '<button data-shell-switch title="Switch profile" class="ds-foot w-full p-3 border-t border-white/15 flex items-center gap-3 text-left hover:bg-white/10 transition-colors">' +
          '<div class="h-8 w-8 rounded-full bg-white grid place-items-center text-xs font-semibold text-primary-700 shrink-0">' + esc(u.initials) + "</div>" +
          '<div class="ds-nav-label text-sm leading-tight flex-1 min-w-0"><div class="font-medium text-white truncate">' + esc(u.name) + "</div>" +
            '<div class="text-xs text-primary-200 flex items-center gap-1 truncate"><svg class="h-3 w-3 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M12 8v4l2.5 2"/></svg>' + esc(u.tz) + "</div></div>" +
          '<svg class="ds-nav-label h-4 w-4 text-primary-200 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 9l4-4 4 4m-8 6l4 4 4-4"/></svg>' +
        "</button>" +
      "</aside>" +
      '<div data-shell-scrim class="fixed inset-0 bg-gray-900/50 z-30 hidden md:hidden"></div>'
    );
  }

  function notif(label, time, tone) {
    return (
      '<a href="#" class="flex gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0">' +
        '<span class="mt-1.5 h-2 w-2 rounded-full bg-' + tone + '-500 shrink-0"></span>' +
        '<span class="min-w-0"><span class="block text-sm text-gray-700">' + label + "</span>" +
        '<span class="block text-xs text-gray-400 mt-0.5">' + esc(time) + "</span></span></a>"
    );
  }

  function menuItem(icon, label, href, attrs) {
    return (
      '<a href="' + (href || "#") + '"' + (attrs || "") +
      ' class="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-100">' +
      '<svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">' + icon + "</svg>" + esc(label) + "</a>"
    );
  }

  // Sample profiles for the switcher (v1: a searchable, paginated /profiles list —
  // a tenant can belong to hundreds, so the mockup shows enough to demo search + scroll).
  var PROFILE_NAMES = [
    "Downtown Dental", "Riverside Auto Group", "Bloom Coffee Roasters", "Summit Family Chiro",
    "Harbor View Realty", "Green Leaf Landscaping", "Pinnacle Fitness Club", "Maple & Main Boutique",
    "Coastal HVAC Services", "Bright Smile Orthodontics", "Urban Nest Interiors", "Ironclad Roofing",
    "Sunset Veterinary Care", "Legacy Law Partners", "Velvet Rose Salon", "Trailhead Outfitters",
    "Cornerstone Insurance", "Wavelength Marketing", "Golden Fork Catering", "Meridian Eye Center",
    "Anchor Point Plumbing", "Rosewood Bakery", "Apex Auto Detailing", "Silverline Electric",
  ];
  function initialsOf(name) {
    var parts = String(name).replace(/&/g, "").split(/\s+/).filter(Boolean);
    return ((parts[0] || "")[0] || "").toUpperCase() + ((parts[1] || "")[0] || "").toUpperCase();
  }
  // deterministic-ish notif count from the name (no Math.random in this env)
  function notifCountOf(name, i) {
    var n = (name.length * 7 + i * 13) % 17;
    return n > 8 ? n - 5 : 0;   // ~half get a badge, values 0..11
  }
  function buildProfiles(user) {
    var list = [{ name: user.name, initials: user.initials, active: true, notif: 0 }];
    PROFILE_NAMES.forEach(function (nm, i) {
      list.push({ name: nm, initials: initialsOf(nm), active: false, notif: notifCountOf(nm, i) });
    });
    return list;
  }
  function profileRow(p) {
    var badge = p.notif
      ? '<span class="ml-2 shrink-0 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-[11px] font-semibold rounded-full bg-white/90 text-primary-700">' + (p.notif > 99 ? "99+" : p.notif) + "</span>"
      : "";
    var check = p.active
      ? '<svg class="ml-2 h-4 w-4 shrink-0 text-white" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>'
      : "";
    return (
      '<button type="button" data-shell-profile="' + esc(p.name) + '"' + (p.active ? ' data-active="1"' : "") +
        ' class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-white transition-colors ' +
        (p.active ? "bg-white/15" : "hover:bg-white/10") + '">' +
        '<span class="h-8 w-8 shrink-0 rounded-full bg-white/15 grid place-items-center text-[11px] font-semibold text-white">' + esc(p.initials) + "</span>" +
        '<span class="flex-1 min-w-0 truncate text-sm ' + (p.active ? "font-semibold" : "text-white/90") + '">' + esc(p.name) + "</span>" +
        badge + check +
      "</button>"
    );
  }
  function profileDrawer(opts) {
    return (
      '<div data-shell-profiles class="fixed inset-0 z-50 hidden">' +
        '<div data-shell-profiles-scrim class="absolute inset-0 bg-gray-900/50"></div>' +
        '<aside data-shell-profiles-panel class="ds-sidebar absolute inset-y-0 left-0 w-[300px] max-w-[85vw] md:left-60 flex flex-col shadow-xl -translate-x-3 opacity-0 transition-all duration-200">' +
          '<div class="px-4 pt-5 pb-4 space-y-4 border-b border-white/15">' +
            '<div class="flex items-center justify-between">' +
              '<span class="font-semibold text-white">Switch profile</span>' +
              '<button data-shell-profiles-close title="Close (Esc)" class="h-8 w-8 grid place-items-center rounded-md text-white/80 hover:text-white hover:bg-white/10"><svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg></button>' +
            "</div>" +
            '<div class="relative">' +
              '<svg class="h-4 w-4 text-white/60 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path stroke-linecap="round" d="M21 21l-4-4"/></svg>' +
              '<input data-shell-profiles-search type="search" placeholder="Search profiles…" class="w-full h-9 pl-9 pr-3 text-sm rounded-lg bg-white/10 border border-white/15 text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/30 focus:bg-white/15" />' +
            "</div>" +
          "</div>" +
          '<nav data-shell-profiles-list class="flex-1 overflow-y-auto p-3 space-y-1"></nav>' +
          '<div data-shell-profiles-empty class="hidden px-3 py-8 text-center text-sm text-white/70">No profiles match your search.</div>' +
          '<a href="' + MOCKUPS_ROOT + 'settings/settings.html" class="block px-4 py-3 border-t border-white/15 text-sm text-white/80 hover:text-white hover:bg-white/10">Manage profiles &rarr;</a>' +
        "</aside>" +
      "</div>"
    );
  }

  function header(opts) {
    var back = opts.back
      ? '<a href="' + opts.back.href + '" class="hidden sm:inline-flex items-center text-sm text-primary-600 hover:underline shrink-0">&larr; ' + esc(opts.back.label) + "</a>"
      : "";
    var route = opts.route
      ? '<span class="hidden lg:flex items-center gap-2 min-w-0"><span class="h-4 w-px bg-gray-200"></span><span class="font-mono text-xs text-gray-400 truncate">' + esc(opts.route) + "</span></span>"
      : "";
    var search = opts.search === null ? "" :
      '<div class="hidden md:flex flex-1 justify-center px-6"><div class="relative w-full max-w-md">' +
        '<svg class="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path stroke-linecap="round" d="M21 21l-4-4"/></svg>' +
        '<input data-shell-search type="text" placeholder="' + esc(opts.search || "Search…") + '" class="w-full h-9 pl-9 pr-10 text-sm bg-gray-50 border border-gray-200 rounded-card placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:bg-white" />' +
        '<kbd class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">/</kbd>' +
      "</div></div>";

    return (
      '<header class="app-header h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">' +
        '<div class="flex items-center gap-3 min-w-0">' +
          '<button data-shell-burger title="Menu" class="icon-btn md:hidden"><svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16"/></svg></button>' +
          back + route +
        "</div>" +
        search +
        '<div class="flex items-center gap-1 shrink-0">' +
          '<button onclick="dsToggleTheme()" title="Toggle theme" class="icon-btn">' + THEME_SUN + THEME_MOON + "</button>" +
          // notifications
          '<div class="relative">' +
            '<button data-shell-bell title="Notifications" class="icon-btn"><svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17a3 3 0 006 0m-9-3.5V11a6 6 0 1112 0v2.5l1.5 2.5H4.5L6 13.5z"/></svg><span class="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-error-500 ring-2 ring-white"></span></button>' +
            '<div data-shell-panel="bell" class="hidden absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-card shadow-pop overflow-hidden z-30">' +
              '<div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between"><span class="text-sm font-semibold text-gray-900">Notifications</span><span class="text-xs text-primary-600">Mark all read</span></div>' +
              notif("CSV import <b class=\"font-medium text-gray-900\">June Leads</b> completed", "2 min ago", "success") +
              notif("12 contacts auto-activated for today", "1 hr ago", "primary") +
              notif("Email to <b class=\"font-medium text-gray-900\">m.owens@…</b> bounced", "3 hr ago", "error") +
              '<a href="' + MOCKUPS_ROOT + 'dashboard/dashboard-activity.html" class="block px-4 py-2.5 text-center text-sm text-primary-600 hover:bg-gray-50">View all</a>' +
            "</div>" +
          "</div>" +
          '<span class="mx-1 h-6 w-px bg-gray-200"></span>' +
          // avatar menu
          '<div class="relative">' +
            '<button data-shell-avatar class="flex items-center gap-2 pl-1 pr-2 py-1 rounded-card hover:bg-gray-100">' +
              '<span class="h-7 w-7 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 grid place-items-center text-[11px] font-semibold text-white">' + esc(opts.user.initials) + "</span>" +
              '<svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6"/></svg>' +
            "</button>" +
            '<div data-shell-panel="avatar" class="hidden absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-card shadow-pop p-1.5 z-30">' +
              '<div class="px-3 py-2 border-b border-gray-100 mb-1"><div class="text-sm font-medium text-gray-900">' + esc(opts.user.name) + '</div><div class="text-xs text-gray-500">' + esc(opts.user.email || "you@acme.com") + "</div></div>" +
              menuItem('<circle cx="12" cy="8" r="3.2"/><path stroke-linecap="round" d="M5 19a7 7 0 0114 0"/>', "Profile", MOCKUPS_ROOT + "settings/settings.html#business-profile") +
              menuItem('<circle cx="12" cy="12" r="2.5"/><path stroke-linecap="round" d="M12 4v2m0 12v2m8-8h-2M6 12H4"/>', "Account settings", MOCKUPS_ROOT + "settings/settings.html#billing") +
              menuItem('<path stroke-linecap="round" stroke-linejoin="round" d="M7 7h10v10H7zM3 12h4m10 0h4"/>', "Switch profile", "#", ' data-shell-switch') +
              '<div class="my-1 border-t border-gray-100"></div>' +
              '<a href="' + MOCKUPS_ROOT + 'auth/auth-login.html" class="flex items-center gap-2.5 px-3 py-2 text-sm text-error-600 rounded-lg hover:bg-error-100"><svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12H6m0 0l3-3m-3 3l3 3m6-9h3a1 1 0 011 1v10a1 1 0 01-1 1h-3"/></svg>Sign out</a>' +
            "</div>" +
          "</div>" +
        "</div>" +
      "</header>"
    );
  }

  function wire(root, opts) {
    var sidebarEl = root.querySelector("[data-shell-sidebar]");
    var scrim = root.querySelector("[data-shell-scrim]");
    var burger = root.querySelector("[data-shell-burger]");
    var panels = [].slice.call(root.querySelectorAll("[data-shell-panel]"));
    var bell = root.querySelector("[data-shell-bell]");
    var avatar = root.querySelector("[data-shell-avatar]");
    var search = root.querySelector("[data-shell-search]");

    function openDrawer(open) {
      sidebarEl.classList.toggle("-translate-x-full", !open);
      sidebarEl.classList.toggle("translate-x-0", open);
      scrim.classList.toggle("hidden", !open);
    }
    function closePanels(except) {
      panels.forEach(function (p) { if (p !== except) p.classList.add("hidden"); });
    }
    function togglePanel(name) {
      var p = root.querySelector('[data-shell-panel="' + name + '"]');
      var willOpen = p.classList.contains("hidden");
      closePanels();
      if (willOpen) p.classList.remove("hidden");
    }

    if (burger) burger.addEventListener("click", function () { openDrawer(true); });
    if (scrim) scrim.addEventListener("click", function () { openDrawer(false); });
    if (bell) bell.addEventListener("click", function (e) { e.stopPropagation(); togglePanel("bell"); });
    if (avatar) avatar.addEventListener("click", function (e) { e.stopPropagation(); togglePanel("avatar"); });

    // ---- Profile switcher (v1 parity) — a searchable, scrollable drawer that
    // scales to hundreds of profiles. Opened from the "Switch profile" menu item
    // or the sidebar profile button; both carry [data-shell-switch].
    var profilesWrap = root.querySelector("[data-shell-profiles]");
    var profilesPanel = root.querySelector("[data-shell-profiles-panel]");
    var profilesList = root.querySelector("[data-shell-profiles-list]");
    var profilesSearch = root.querySelector("[data-shell-profiles-search]");
    var profilesEmpty = root.querySelector("[data-shell-profiles-empty]");
    var profiles = buildProfiles(opts.user);

    function renderProfiles(q) {
      q = (q || "").trim().toLowerCase();
      var matches = q ? profiles.filter(function (p) { return p.name.toLowerCase().indexOf(q) !== -1; }) : profiles;
      profilesList.innerHTML = matches.map(profileRow).join("");
      profilesEmpty.classList.toggle("hidden", matches.length > 0);
    }
    function openProfiles() {
      if (!profilesWrap) return;
      renderProfiles(profilesSearch.value);
      profilesWrap.classList.remove("hidden");
      requestAnimationFrame(function () {
        profilesPanel.classList.remove("-translate-x-3", "opacity-0");
        profilesPanel.classList.add("translate-x-0", "opacity-100");
      });
      setTimeout(function () { profilesSearch.focus(); }, 40);
    }
    function closeProfiles() {
      if (!profilesWrap) return;
      profilesPanel.classList.add("-translate-x-3", "opacity-0");
      profilesPanel.classList.remove("translate-x-0", "opacity-100");
      setTimeout(function () { profilesWrap.classList.add("hidden"); }, 180);
    }

    [].slice.call(root.querySelectorAll("[data-shell-switch]")).forEach(function (btn) {
      btn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); closePanels(); openDrawer(false); openProfiles(); });
    });
    if (profilesSearch) profilesSearch.addEventListener("input", function () { renderProfiles(profilesSearch.value); });
    if (profilesList) profilesList.addEventListener("click", function (e) {
      var row = e.target.closest("[data-shell-profile]");
      if (!row) return;
      var name = row.getAttribute("data-shell-profile");
      if (row.getAttribute("data-active")) { OggvoShell.toast("You're already on " + name, "gray"); return; }
      closeProfiles();
      OggvoShell.toast("Switched to " + name, "success");
    });
    var pClose = root.querySelector("[data-shell-profiles-close]");
    var pScrim = root.querySelector("[data-shell-profiles-scrim]");
    if (pClose) pClose.addEventListener("click", closeProfiles);
    if (pScrim) pScrim.addEventListener("click", closeProfiles);

    // ---- Collapsible sidebar — toggles a root class (persisted); theme.js
    // restores it pre-paint so there's no expand→collapse flash on navigation.
    var collapseBtn = root.querySelector("[data-shell-collapse]");
    function setCollapsed(on) {
      document.documentElement.classList.toggle("ds-nav-collapsed", on);
      try { localStorage.setItem("ds-nav-collapsed", on ? "1" : "0"); } catch (e) {}
      if (collapseBtn) {
        collapseBtn.title = on ? "Expand sidebar" : "Collapse sidebar";
        collapseBtn.setAttribute("aria-label", collapseBtn.title);
      }
    }
    if (collapseBtn) {
      setCollapsed(document.documentElement.classList.contains("ds-nav-collapsed"));
      collapseBtn.addEventListener("click", function () {
        setCollapsed(!document.documentElement.classList.contains("ds-nav-collapsed"));
      });
    }

    document.addEventListener("click", function (e) {
      if (!e.target.closest("[data-shell-panel]") && !e.target.closest("[data-shell-bell]") && !e.target.closest("[data-shell-avatar]")) {
        closePanels();
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closePanels(); openDrawer(false); closeProfiles(); }
      if (e.key === "/" && search && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
        e.preventDefault(); search.focus();
      }
    });
  }

  /* ============================================================
   *  Story binding — click any [data-story] element (in Annotate
   *  mode) to slide in its user story + acceptance criteria.
   *  Data comes from assets/stories.data.js (window.OGGVO_STORIES),
   *  generated from docs/<domain>/user-stories.md by build-stories.mjs.
   * ============================================================ */
  var stories = {
    domain: null,      // page default domain, so bare ids resolve (mount({ storyDomain }))
    on: false,
    drawer: null,
    ensureData: function (cb) {
      if (window.OGGVO_STORIES) return cb(true);
      // stories.data.js not on the page yet — inject it (works over file://,
      // where fetch() of a local file is blocked). SCRIPT_BASE is captured at
      // load time so this resolves correctly no matter how deep the page sits.
      var s = document.createElement("script");
      s.src = SCRIPT_BASE + "stories.data.js";
      s.onload = function () { cb(!!window.OGGVO_STORIES); };
      s.onerror = function () { console.warn("OggvoShell: could not load stories.data.js — run `node tools/build-stories.mjs`"); cb(false); };
      document.head.appendChild(s);
    },
    resolve: function (raw) {
      if (!window.OGGVO_STORIES) return null;
      if (raw.indexOf(":") !== -1) return window.OGGVO_STORIES[raw] ? raw : null;   // domain:id
      if (this.domain && window.OGGVO_STORIES[this.domain + ":" + raw]) return this.domain + ":" + raw;
      var keys = (window.OGGVO_STORIES_BARE || {})[raw];                            // unambiguous bare id
      if (keys && keys.length === 1) return keys[0];
      if (keys && keys.length > 1) console.warn("OggvoShell: '" + raw + "' is ambiguous across " + keys.join(", ") + " — qualify it or set storyDomain.");
      return null;
    },
    open: function (raw, ac) {
      var self = this;
      this.ensureData(function (ok) {
        if (!ok) return;
        var key = self.resolve(raw);
        var st = key && window.OGGVO_STORIES[key];
        if (!st) { OggvoShell.toast("No story bound for '" + raw + "'", "error"); return; }
        self.render(st, key, ac);
      });
    },
    render: function (st, key, ac) {
      var d = this.drawer;
      d.querySelector("[data-story-body]").innerHTML =
        '<div class="ds-story-eyebrow">' +
          '<span class="ds-story-chip">' + esc(st.domainLabel) + "</span>" +
          (st.epic ? '<span class="ds-story-epic">' + esc(st.epic) + "</span>" : "") +
        "</div>" +
        '<div class="ds-story-idrow"><code class="ds-story-id">' + esc(st.id) + "</code>" +
          (ac ? '<span class="ds-story-acbadge">' + esc(ac) + "</span>" : "") + "</div>" +
        '<h2 class="ds-story-title">' + esc(st.title) + "</h2>" +
        (st.persona ? '<p class="ds-story-persona">' + st.persona + "</p>" : "") +
        '<div class="ds-story-md">' + st.html + "</div>" +
        '<a class="ds-story-source" href="' + esc(st.sourceHref) + '" target="_blank" rel="noopener">' +
          "View in " + esc(st.domain) + "/user-stories.md &rarr;</a>";
      d.setAttribute("data-open", "true");
      d.querySelector("[data-story-scrim]").classList.remove("hidden");
      // focus / highlight the specific acceptance criterion, if asked
      var body = d.querySelector("[data-story-body]");
      body.scrollTop = 0;
      if (ac) {
        var target = body.querySelector("#ac-" + ac);
        if (target) {
          target.classList.add("ds-ac-flash");
          setTimeout(function () { target.scrollIntoView({ block: "center", behavior: "smooth" }); }, 60);
          setTimeout(function () { target.classList.remove("ds-ac-flash"); }, 2200);
        }
      }
    },
    close: function () {
      if (!this.drawer) return;
      this.drawer.setAttribute("data-open", "false");
      this.drawer.querySelector("[data-story-scrim]").classList.add("hidden");
    },
    setMode: function (on) {
      this.on = on;
      document.body.classList.toggle("ds-annos-on", on);
      var btn = document.querySelector("[data-shell-annos]");
      if (btn) btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) this.decorate(); else this.undecorate();
    },
    decorate: function () {
      var self = this;
      [].slice.call(document.querySelectorAll("[data-story]")).forEach(function (el) {
        if (el.getAttribute("data-anno-ready")) return;
        el.setAttribute("data-anno-ready", "1");
        var raw = el.getAttribute("data-story");
        var acAttr = el.getAttribute("data-ac");
        var label = raw.replace(/^.*:/, "").replace(/^US-/, "") + (acAttr ? " · " + acAttr : "");
        var tag = el.tagName;
        if (["INPUT", "TEXTAREA", "IMG", "SVG", "SELECT"].indexOf(tag) === -1) {
          if (getComputedStyle(el).position === "static") { el.setAttribute("data-anno-pos", "1"); el.style.position = "relative"; }
          var b = document.createElement("span");
          b.className = "ds-anno-badge";
          b.textContent = label;
          el.appendChild(b);
        }
      });
    },
    undecorate: function () {
      [].slice.call(document.querySelectorAll("[data-anno-ready]")).forEach(function (el) {
        el.removeAttribute("data-anno-ready");
        if (el.getAttribute("data-anno-pos")) { el.style.position = ""; el.removeAttribute("data-anno-pos"); }
        var b = el.querySelector(":scope > .ds-anno-badge");
        if (b) b.remove();
      });
    },
    init: function (shell, opts) {
      var self = this;
      this.domain = opts.storyDomain || null;

      // annotate toggle in the header action cluster
      var actions = shell.querySelector("header .flex.items-center.gap-1");
      if (actions) {
        var btn = document.createElement("button");
        btn.setAttribute("data-shell-annos", "");
        btn.setAttribute("aria-pressed", "false");
        btn.title = "Toggle story annotations";
        btn.className = "icon-btn ds-annos-btn";
        btn.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h8M8 14h5M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1h-7l-4 4v-4H5a1 1 0 01-1-1V6a1 1 0 011-1z"/></svg>';
        btn.addEventListener("click", function () { self.setMode(!self.on); });
        actions.insertBefore(btn, actions.firstChild);
      }

      // the drawer (one per page, injected once)
      var d = document.createElement("div");
      d.className = "ds-story-drawer";
      d.setAttribute("data-open", "false");
      d.innerHTML =
        '<div data-story-scrim class="ds-story-scrim hidden"></div>' +
        '<aside class="ds-story-panel" role="dialog" aria-label="User story">' +
          '<button data-story-close class="ds-story-close" title="Close (Esc)">' +
            '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg></button>' +
          '<div data-story-body class="ds-story-scroll"></div>' +
        "</aside>";
      document.body.appendChild(d);
      this.drawer = d;
      d.querySelector("[data-story-close]").addEventListener("click", function () { self.close(); });
      d.querySelector("[data-story-scrim]").addEventListener("click", function () { self.close(); });

      // click-to-open is GATED by annotate mode, so normal mockup interaction
      // is untouched when the toggle is off.
      document.addEventListener("click", function (e) {
        if (!self.on) return;
        if (e.target.closest(".ds-story-drawer")) return;
        var el = e.target.closest("[data-story]");
        if (!el) return;
        e.preventDefault(); e.stopPropagation();
        self.open(el.getAttribute("data-story"), el.getAttribute("data-ac"));
      }, true);

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") self.close();
        if ((e.key === "a" || e.key === "A") && (e.altKey) ) { e.preventDefault(); self.setMode(!self.on); }
      });
    },
  };

  var OggvoShell = {
    nav: NAV,
    stories: stories,
    /** Programmatically open a story drawer. key = "domain:US-x" or a bare id. */
    openStory: function (key, ac) { stories.open(key, ac); },
    mount: function (opts) {
      opts = opts || {};
      opts.user = Object.assign({ name: "Acme Co", initials: "AC", tz: "America/New_York", email: "team@acme.com" }, opts.user || {});
      var content = document.querySelector("[data-shell-content]");
      if (!content) { console.warn("OggvoShell: no [data-shell-content] element found"); return; }
      var shell = document.createElement("div");
      shell.className = "min-h-screen flex";
      shell.innerHTML = sidebar(opts) + '<div class="flex-1 flex flex-col min-w-0">' + header(opts) + '<div data-shell-slot class="flex-1 flex flex-col min-w-0"></div></div>' + profileDrawer(opts);
      document.body.insertBefore(shell, content);
      shell.querySelector("[data-shell-slot]").appendChild(content);
      wire(shell, opts);
      stories.init(shell, opts);
      return shell;
    },

    /** Reusable toast. tone: success | error | primary | gray (default). */
    toast: function (msg, tone) {
      var host = document.querySelector(".ds-toast-host");
      if (!host) { host = document.createElement("div"); host.className = "ds-toast-host"; document.body.appendChild(host); }
      var dot = { success: "bg-success-500", error: "bg-error-500", primary: "bg-primary-500" }[tone] || "bg-gray-400";
      var t = document.createElement("div");
      t.className = "ds-toast";
      t.innerHTML = '<span class="inline-block h-2 w-2 rounded-full ' + dot + '"></span><span>' + msg + "</span>";
      host.appendChild(t);
      requestAnimationFrame(function () { t.classList.add("ds-show"); });
      setTimeout(function () { t.classList.remove("ds-show"); setTimeout(function () { t.remove(); }, 220); }, 2600);
      return t;
    },

    /** Reusable drag-reorder for a list. Items: [data-sortable-item] (with optional
     *  [data-drag-handle] + data-id). opts.onSort(ids[]) fires after a drop.
     *  Returns { refresh, order } — call refresh() after adding rows dynamically. */
    sortable: function (listEl, opts) {
      opts = opts || {};
      var dragEl = null, prepped = [];
      function order() {
        return [].slice.call(listEl.querySelectorAll("[data-sortable-item]"))
          .map(function (i) { return i.getAttribute("data-id") || i.getAttribute("data-name"); });
      }
      function prep(item) {
        if (prepped.indexOf(item) !== -1) return; prepped.push(item);
        var handle = item.querySelector("[data-drag-handle]") || item;
        handle.style.cursor = "grab";
        handle.addEventListener("mousedown", function () { item.setAttribute("draggable", "true"); });
        handle.addEventListener("mouseup", function () { item.removeAttribute("draggable"); });
        item.addEventListener("dragstart", function (e) { dragEl = item; item.classList.add("ds-dragging"); if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; });
        item.addEventListener("dragend", function () { item.classList.remove("ds-dragging"); item.removeAttribute("draggable"); dragEl = null; if (opts.onSort) opts.onSort(order()); });
      }
      function after(y) {
        var best = { offset: -Infinity, el: null };
        [].slice.call(listEl.querySelectorAll("[data-sortable-item]:not(.ds-dragging)")).forEach(function (c) {
          var b = c.getBoundingClientRect(), off = y - b.top - b.height / 2;
          if (off < 0 && off > best.offset) best = { offset: off, el: c };
        });
        return best.el;
      }
      listEl.addEventListener("dragover", function (e) {
        e.preventDefault(); if (!dragEl) return;
        var ref = after(e.clientY);
        if (ref == null) listEl.appendChild(dragEl); else listEl.insertBefore(dragEl, ref);
      });
      [].slice.call(listEl.querySelectorAll("[data-sortable-item]")).forEach(prep);
      return { refresh: function () { [].slice.call(listEl.querySelectorAll("[data-sortable-item]")).forEach(prep); }, order: order };
    },

    /** Reusable single-select button group (segmented controls, tab/metric pickers).
     *  Buttons inside `container` must carry data-value. Clicking one swaps the
     *  active/inactive class lists and calls opts.onChange(value, btn).
     *  opts: { active: "class list", inactive: "class list", onChange } -> { select(value|btn) } */
    buttonGroup: function (container, opts) {
      opts = opts || {};
      var on = (opts.active || "").split(/\s+/).filter(Boolean);
      var off = (opts.inactive || "").split(/\s+/).filter(Boolean);
      function paint(target) {
        [].slice.call(container.querySelectorAll("[data-value]")).forEach(function (b) {
          var active = b === target;
          if (off.length) (active ? off : on).forEach(function (c) { b.classList.remove(c); });
          if (on.length) (active ? on : off).forEach(function (c) { b.classList.add(c); });
          b.setAttribute("aria-selected", active ? "true" : "false");
        });
      }
      container.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-value]");
        if (!btn || !container.contains(btn)) return;
        paint(btn);
        if (opts.onChange) opts.onChange(btn.getAttribute("data-value"), btn);
      });
      return {
        select: function (v) {
          var btn = typeof v === "string" ? container.querySelector('[data-value="' + v + '"]') : v;
          if (btn) { paint(btn); if (opts.onChange) opts.onChange(btn.getAttribute("data-value"), btn); }
        },
      };
    },
  };
  window.OggvoShell = OggvoShell;
})();
