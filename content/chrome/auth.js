/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Modeled on browserRequest used by the OAuth module */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource:///modules/gloda/log4moz.js");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const wpl = Ci.nsIWebProgressListener;
const log = Log4Moz.getConfiguredLogger("SynnefoAuth");
const kCookieName = "_pithos2_a";


/*
 * Implement 'endsWith' function for string objects
 */
function endsWith(str, suffix) {
  return str.length >= suffix.length &&
    str.substr(str.length - suffix.length) == suffix;
}


/*
 * Retrieve our cookie and remove it from CookieManger
 */
function getCookie() {
  var cookieMgr = Cc["@mozilla.org/cookiemanager;1"].getService(Ci.nsICookieManager);
  var login_host = host();

  for (let e = cookieMgr.enumerator; e.hasMoreElements();) {
    let cookie = e.getNext().QueryInterface(Ci.nsICookie);
    if (cookie.name == kCookieName && endsWith(login_host, cookie.host)) {
      return cookie;
    }
  }

  return null;
}

/*
 * Get UUID and token from our cookie
 */
function retrieveToken(cookie) {
  return decodeURIComponent(cookie.value).split("|");
}

/*
 * Retrieve loginUrl and host
 */
function loginUrl() {
  let request = window.arguments[0].wrappedJSObject;
  return request.loginURL;
}

function host() {
  let ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  let uri = ioService.newURI(loginUrl(), null, null);
  return uri.host;
}


/*
 * Add a browser listener.
 * This listener will be responsible for changing the location bar
 * of our window as well as the security icons in the toolbar.
 * Also make sure that user will not visit any pages except for the
 * ones needed.
 */
var reporterListener = {
  _isBusy: false,
  get securityButton() {
    delete this.securityButton;
    return this.securityButton = document.getElementById("security-button");
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIWebProgressListener,
                                         Ci.nsISupportsWeakReference,
                                         Ci.nsISupports]),

  onStateChange: function(/*in nsIWebProgress*/ aWebProgress,
                     /*in nsIRequest*/ aRequest,
                     /*in unsigned long*/ aStateFlags,
                     /*in nsresult*/ aStatus) {
    /* If the user tries to leave our page, stop him. */
    // let state_transferring = aStateFlags & wpl.STATE_TRANSFERRING;
    // let state_is_request = aStateFlags & wpl.STATE_IS_REQUEST;
    // if (state_transferring && state_is_request) {
    //   let curr_host = aWebProgress.DOMWindow.location.host;
    //   if (!endsWith(curr_host, host())) {
    //     aRequest.cancel(Cr.NS_BINDING_REDIRECTED);
    //     aWebProgress.DOMWindow.location.href = loginUrl();
    //   }
    // }
  },

  onProgressChange: function(/*in nsIWebProgress*/ aWebProgress,
                        /*in nsIRequest*/ aRequest,
                        /*in long*/ aCurSelfProgress,
                        /*in long */aMaxSelfProgress,
                        /*in long */aCurTotalProgress,
                        /*in long */aMaxTotalProgress) {
  },

  onLocationChange: function(/*in nsIWebProgress*/ aWebProgress,
                        /*in nsIRequest*/ aRequest,
                        /*in nsIURI*/ aLocation) {
      document.getElementById("headerMessage").textContent = aLocation.spec;

      // Let's read our cookie
      var cookie = getCookie();
      if (cookie != null && cookie.value != "") {
        // We found our token, exit...
        let value = retrieveToken(cookie);
        successRequest(value[0], value[1]);
      }
  },

  onStatusChange: function(/*in nsIWebProgress*/ aWebProgress,
                      /*in nsIRequest*/ aRequest,
                      /*in nsresult*/ aStatus,
                      /*in wstring*/ aMessage) {
  },

  onSecurityChange: function(/*in nsIWebProgress*/ aWebProgress,
                        /*in nsIRequest*/ aRequest,
                        /*in unsigned long*/ aState) {
    const wpl_security_bits = wpl.STATE_IS_SECURE |
                              wpl.STATE_IS_BROKEN |
                              wpl.STATE_IS_INSECURE |
                              wpl.STATE_SECURE_HIGH |
                              wpl.STATE_SECURE_MED |
                              wpl.STATE_SECURE_LOW;
    let browser = document.getElementById("requestFrame");
    let level;

    switch (aState & wpl_security_bits) {
      case wpl.STATE_IS_SECURE | wpl.STATE_SECURE_HIGH:
        level = "high";
        break;
      case wpl.STATE_IS_SECURE | wpl.STATE_SECURE_MED:
      case wpl.STATE_IS_SECURE | wpl.STATE_SECURE_LOW:
        level = "low";
        break;
      case wpl.STATE_IS_BROKEN:
        level = "broken";
        break;
    }
    if (level) {
      this.securityButton.setAttribute("level", level);
      this.securityButton.removeAttribute("loading");
      this.securityButton.hidden = false;
    } else {
      this.securityButton.hidden = true;
      this.securityButton.removeAttribute("level");
    }
    // XXX: This used to work in previous Thunderbird version
    // this.securityButton.setAttribute("tooltiptext",
    //                                  browser.securityUI.tooltipText);
  }
}


/*
 * Load login page
 */
function onLoad()
{
  document.getElementById("security-button").setAttribute("loading", "true");
  let request = window.arguments[0].wrappedJSObject;
  document.getElementById("headerMessage").textContent = request.promptText;

  // Remove previous cookies
  let cookieMgr = Cc["@mozilla.org/cookiemanager;1"].getService(Ci.nsICookieManager);
  cookieMgr.removeAll();

  // Load first page
  loadRequestedUrl(loginUrl());
}

function loadRequestedUrl(aUrl)
{
  let request = window.arguments[0].wrappedJSObject;

  let browser = document.getElementById("requestFrame");
  browser.addProgressListener(reporterListener,
                              Ci.nsIWebProgress.NOTIFY_ALL);
  if (aUrl != "") {
    browser.setAttribute("src", aUrl);
    document.getElementById("headerMessage").textContent = aUrl;
  }
}


/*
 * Report back and close our window
 */
function successRequest(uuid, token)
{
  // Remove all cookies
  let cookieMgr = Cc["@mozilla.org/cookiemanager;1"].getService(Ci.nsICookieManager);
  cookieMgr.removeAll();

  let request = window.arguments[0].wrappedJSObject;
  request.succeeded(uuid, token);
  window.close();
}

function cancelRequest()
{
  reportUserClosed();
  window.close();
}

/* Called by auth.xul */
function reportUserClosed()
{
  // Remove all cookies
  let cookieMgr = Cc["@mozilla.org/cookiemanager;1"].getService(Ci.nsICookieManager);
  cookieMgr.removeAll();

  let request = window.arguments[0].wrappedJSObject;
  request.failed();
}
