window.momi = {
    callNative: function (methodName, params) {
        return new Promise((resolve, reject) => {
            if (typeof window.momiBridge !== "undefined") {
                window.momiBridge.callNative(methodName, JSON.stringify(params), (responseBlob) => {
                    let response = JSON.parse(atob(responseBlob));
                    if ("error" in response && response.error != null) {
                        reject(response.error);
                    } else if ("result" in response && response.result != null) {
                        resolve(response.result);
                    } else {
                        reject({
                            code: 1,
                            message: "No `result` neither `error` returned from the host"
                        });
                    }
                });
            } else {
                let errorMessage = "No `window.momiBridge` injected!";
                console.error(errorMessage);
                reject({
                    code: 1,
                    message: errorMessage
                });
            }
        });
    },
    isDefaultBrowser: function () {
        return window.momi.callNative("isDefaultBrowser", 0);
    },
    openDefaultBrowserDialog: function () {
        return window.momi.callNative("openDefaultBrowserDialog", 0);
    },
    getAccessToken: function (forceRefresh) {
        return window.momi.callNative("getAccessToken", { "forceRefresh": forceRefresh });
    },
    openNativeScreen: function (screenName) {
        return window.momi.callNative("openNativeScreen", { "screenName": screenName });
    },
    getClientName: function (screenName) {
        return window.momi.callNative("getClientName", 0);
    },
    getClientLocalization: function () {
        return window.momi.callNative("getClientLocalization", 0);
    },
    getClientVersion: function () {
        return window.momi.callNative("getClientVersion", 0);
    },
};

const event = new Event("momi.loaded");
window.dispatchEvent(event);
