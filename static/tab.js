class Tab {
    constructor(browser, background = false) {
        this.browser = browser;

        this.tabEl = this.browser.chromeTabs.addTab({}, {background: true});
        this.browser.tabs.set(this.tabEl, this);
        
        this.iframe = document.createElement("iframe");
        this.iframe.classList.add("browserTabContents");
        this.iframe.style.setProperty("display", "none");
        var self = this;
        this.browser.iFrameContainer.appendChild(this.iframe);

        this.currentUrl = '';
        this.currentTitle = '';
        this.currentFavi = '';
        this.isActive = false;
        this.handleUnload();

        if(!background) this.browser.chromeTabs.setCurrentTab(this.tabEl);
    }

    // Needed because you can't listen for DOMContentLoaded from an iframe across navigations
    handleUnload() {
        var self = this;
        setTimeout(() => {
            if(!self.iframe || !self.iframe.contentWindow) return;
            self.iframe.contentWindow.addEventListener("DOMContentLoaded", () => { self.handleOnload() });
            self.iframe.contentWindow.addEventListener("unload", () => { self.handleUnload() });
        }, 0);
    }

    handleOnload() {
        var url = this.iframe.contentWindow.location.toString();
        if (url == "about:blank") {
            return;
        }
        if (url.startsWith(this.browser.resourcesPrefix)) {
            url = url.replace(this.browser.resourcesPrefix, '');
            url = url.substring(0, url.length - 5);
            url = this.browser.resourcesProtocol + url;
        } else {
            url = url.replace(window.location.origin + baseUrlFor(this.browser.settings.getSetting("currentProxyId")), '')
            url = decodeUrl(url, this.browser.settings.getSetting("currentProxyId"));
        }
        this.currentUrl = url;

        // get title of iframe
        var title = this.iframe.contentWindow.document.title;
        if (title == "") {
            title = url;
        }
        this.currentTitle = title;

        this.iframe.contentWindow.document.querySelectorAll("a").forEach((e) => {
            e.removeAttribute("target");
        });

        if(this.isActive) this.setBrowserAttributes();

        var self = this;
        (async (url) => {
            // get favicon of iframe
            var favi = null;
            if(url.startsWith(this.browser.resourcesProtocol)) {
                favi = getIconNoFallback(self.iframe.contentWindow.document);
            } else if (url != "") {
                var faviUrl = getIcon(self.iframe.contentWindow.document, new URL(url));
                var blob = await fetch(baseUrlFor("UV") + encodeUrl(faviUrl, "UV")).then((r) => r.blob())
                if (blob != null) {
                    favi = baseUrlFor("UV") + encodeUrl(faviUrl, "UV");
                }
            }

            console.debug("got favi: ", favi);

            if (favi == null) {
                console.debug("falling back to default icon");
                favi = this.browser.resourcesPrefix + "darkfavi.png";
            }

            this.browser.history.push(url, title, favi);
            this.currentFavi = favi;

            // update tab
            self.browser.chromeTabs.updateTab(self.tabEl, {
                favicon: favi,
                title: title
            });
        })(url);
    }

    handleSwitchAway() {
        this.iframe.style.setProperty("display", "none");
        this.isActive = false;
    }

    handleSwitchTo() {
        this.isActive = true;
        this.browser.activeTab = this;
        this.iframe.style.removeProperty("display");
        this.setBrowserAttributes();
    }

    handleHistoryBack() {
        this.iframe.contentWindow.history.back();
    }

    handleHistoryForward() {
        this.iframe.contentWindow.history.forward();
    }

    handleReload() {
        this.iframe.contentWindow.location.reload();
    }

    handleClose() {
        this.iframe.remove();
    }

    setBrowserAttributes() {
        this.browser.addressBar.value = this.currentUrl;
        this.browser.browserTitle = this.currentTitle + this.browser.titleSuffix;
        document.title = this.browser.browserTitle;
    }
    
    navigateTo(url, callback) {
        var self = this;
        if (url == "" || url.startsWith(this.browser.resourcesProtocol)) {
            if (url == "") {
                url = this.browser.resourcesPrefix + "blank.html";
            } else if (url.startsWith(this.browser.resourcesProtocol)) {
                url = url.replace(this.browser.resourcesProtocol, this.browser.resourcesPrefix);
                url = url + ".html"
            }
            this.iframe.src = url;
            if(callback) callback();
        } else if (isUrl(url)) {
            if (hasHttps(url)) {
                proxyUsing(url, this.browser.settings.getSetting("currentProxyId"), (url) => {
                    self.iframe.src = url;
                    if(callback) callback();
                });
            } else {
                proxyUsing('https://' + url, this.browser.settings.getSetting("currentProxyId"), (url) => {
                    self.iframe.src = url;
                    if(callback) callback();
                })
            }
            return;
        } else {
            proxyUsing(this.browser.settings.getSetting("searchEngineUrl") + url, this.browser.settings.getSetting("currentProxyId"), (url) => {
                self.iframe.src = url;
                if(callback) callback();
            });
        }
    }
}
